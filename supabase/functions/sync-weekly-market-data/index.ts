import { createClient } from "npm:@supabase/supabase-js@2";

const WARSAW_TIME_ZONE = "Europe/Warsaw";
const BASE_CURRENCY = "PLN";
const ALPHA_VANTAGE_MIN_INTERVAL_MS = 12_500;

const TWELVE_DATA_MIN_INTERVAL_MS = 8_000;

let twelveDataNextRequestAt = 0;

async function waitForTwelveDataSlot(): Promise<void> {
  const now = Date.now();

  const scheduledAt = Math.max(
    now,
    twelveDataNextRequestAt,
  );

  twelveDataNextRequestAt =
    scheduledAt +
    TWELVE_DATA_MIN_INTERVAL_MS;

  const waitMs = scheduledAt - now;

  if (waitMs > 0) {
    await new Promise<void>(
      (resolve) =>
        setTimeout(resolve, waitMs),
    );
  }
}

let alphaVantageNextRequestAt = 0;

async function waitForAlphaVantageSlot(): Promise<void> {
  const now = Date.now();

  const scheduledAt =
    Math.max(
      now,
      alphaVantageNextRequestAt,
    );

  alphaVantageNextRequestAt =
    scheduledAt +
    ALPHA_VANTAGE_MIN_INTERVAL_MS;

  const waitMs =
    scheduledAt - now;

  if (waitMs > 0) {
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          waitMs,
        ),
    );
  }
}

function roundToMinorUnit(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function sanitizeProviderMessage(
  message: string,
): string {
  return message.replace(
    /API key as [A-Za-z0-9_-]+/gi,
    "API key as [REDACTED]",
  );
}

type SyncRequest = {
  trigger?: "cron" | "manual";
  force?: boolean;
  dryRun?: boolean;
  retryFailedOnly?: boolean;
  targetSaturday?: string;
};

type InstrumentRow = {
  id: string;
  workspace_id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  default_currency: string;
  tracking_mode: string;
  is_active: boolean;
};

type SourceRow = {
  workspace_id: string;
  instrument_id: string;
  provider:
    | "eodhd"
    | "alpha_vantage"
    | "twelve_data"
    | "bitvavo";
  provider_symbol: string;
  priority: number;
  is_enabled: boolean;
};

type Quote = {
  provider: SourceRow["provider"];
  symbol: string;
  priceDate: string;
  price: number;
  currency: string;
  metadata: Record<string, unknown>;
};

type FxQuote = {
  code: "USD" | "EUR";
  rateDate: string;
  rate: number;
  tableNo: string;
};

type InstrumentResult = {
  instrumentId: string;
  ticker: string | null;
  status: "success" | "failed";
  quote?: Quote;
  errors: string[];
};

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
      },
    },
  );
}

function isIsoDate(
  value: string | undefined,
): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(
        Date.parse(`${value}T00:00:00Z`),
      ),
  );
}

function addDays(
  dateValue: string,
  days: number,
): string {
  const date =
    new Date(`${dateValue}T00:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() + days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function isSaturday(
  dateValue: string,
): boolean {
  return (
    new Date(
      `${dateValue}T00:00:00Z`,
    ).getUTCDay() === 6
  );
}

function getWarsawParts(
  date: Date,
): {
  date: string;
  weekday: string;
  hour: number;
  minute: number;
} {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: WARSAW_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      },
    );

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter(
          (part) =>
            part.type !== "literal",
        )
        .map((part) => [
          part.type,
          part.value,
        ]),
    );

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function formatDateInTimeZone(
  date: Date,
  timeZone: string,
): string {
  const parts =
    Object.fromEntries(
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      )
        .formatToParts(date)
        .filter(
          (part) =>
            part.type !== "literal",
        )
        .map((part) => [
          part.type,
          part.value,
        ]),
    );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseNumber(
  value: unknown,
): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

async function fetchJson(
  url: string,
  options?: {
    attempts?: number;
  },
): Promise<unknown> {
  const attempts =
    options?.attempts ?? 1;

  let latestError:
    Error | null = null;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    try {
      const response = await fetch(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "PortfolioDashboard/1.0 market-data-sync",
          },
          signal:
            AbortSignal.timeout(12_000),
        },
      );

      if (!response.ok) {
        const body =
          await response.text();

        throw new Error(
          `HTTP ${response.status}: ${body.slice(0, 300)}`,
        );
      }

      return await response.json();
    } catch (error) {
      latestError =
        error instanceof Error
          ? error
          : new Error(
              String(error),
            );

      if (attempt < attempts) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              600 * attempt,
            ),
        );
      }
    }
  }

  throw latestError ??
    new Error("Request failed.");
}

async function fetchEodhdQuote(
  symbol: string,
  targetFriday: string,
  apiKey: string,
  expectedCurrency: string,
): Promise<Quote> {
  const params =
    new URLSearchParams({
      api_token: apiKey,
      fmt: "json",
      period: "d",
      order: "d",
      from:
        addDays(
          targetFriday,
          -14,
        ),
      to: targetFriday,
    });

  const payload =
    await fetchJson(
      `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}?${params.toString()}`,
    ) as Array<{
      date?: string;
      close?: number | string;
    }>;

  if (!Array.isArray(payload)) {
    throw new Error(
      `EODHD returned an invalid EOD payload for ${symbol}.`,
    );
  }

  const latest =
    payload
      .map((item) => ({
        date:
          item.date ?? "",
        close:
          parseNumber(
            item.close,
          ),
      }))
      .filter(
        (
          item,
        ): item is {
          date: string;
          close: number;
        } =>
          Boolean(item.date) &&
          item.close !== null &&
          item.date <=
            targetFriday,
      )
      .sort(
        (first, second) =>
          second.date.localeCompare(
            first.date,
          ),
      )[0];

  if (!latest) {
    throw new Error(
      `EODHD returned no completed daily close through ${targetFriday} for ${symbol}.`,
    );
  }

  return {
    provider: "eodhd",
    symbol,
    priceDate: latest.date,
    price: latest.close,
    currency:
      expectedCurrency,
    metadata: {
      endpoint: "eod",
      period: "d",
    },
  };
}

async function fetchAlphaVantageQuote(
  symbol: string,
  targetFriday: string,
  apiKey: string,
  expectedCurrency: string,
): Promise<Quote> {
  const params =
    new URLSearchParams({
      function:
        "TIME_SERIES_DAILY",
      symbol,
      outputsize: "compact",
      apikey: apiKey,
    });

  await waitForAlphaVantageSlot();

  const payload =
    await fetchJson(
      `https://www.alphavantage.co/query?${params.toString()}`,
    ) as Record<string, unknown>;

  const providerMessage =
    payload.Note ??
    payload.Information ??
    payload["Error Message"];

  if (providerMessage) {
    throw new Error(
      String(providerMessage),
    );
  }

  const series =
    payload[
      "Time Series (Daily)"
    ] as
      | Record<
          string,
          Record<string, string>
        >
      | undefined;

  if (!series) {
    throw new Error(
      `Alpha Vantage returned no daily series for ${symbol}.`,
    );
  }

  const latest =
    Object.entries(series)
      .filter(
        ([date]) =>
          date <= targetFriday,
      )
      .sort(
        ([first], [second]) =>
          second.localeCompare(first),
      )
      .map(
        ([date, values]) => ({
          date,
          close:
            parseNumber(
              values["4. close"],
            ),
        }),
      )
      .find(
        (
          item,
        ): item is {
          date: string;
          close: number;
        } =>
          item.close !== null,
      );

  if (!latest) {
    throw new Error(
      `Alpha Vantage returned no completed daily close through ${targetFriday} for ${symbol}.`,
    );
  }

  return {
    provider: "alpha_vantage",
    symbol,
    priceDate: latest.date,
    price: latest.close,
    currency:
      expectedCurrency,
    metadata: {
      function:
        "TIME_SERIES_DAILY",
    },
  };
}

async function fetchTwelveDataQuote(
  symbol: string,
  targetFriday: string,
  apiKey: string,
  expectedCurrency: string,
): Promise<Quote> {
  const params =
    new URLSearchParams({
      symbol,
      interval: "1day",
      outputsize: "10",
      apikey: apiKey,
    });

  await waitForTwelveDataSlot();

  const payload =
    await fetchJson(
      `https://api.twelvedata.com/time_series?${params.toString()}`,
    ) as {
      status?: string;
      message?: string;
      values?: Array<{
        datetime?: string;
        close?: string | number;
      }>;
    };

  if (
    payload.status === "error"
  ) {
    throw new Error(
      payload.message ??
        `Twelve Data returned an error for ${symbol}.`,
    );
  }

  const latest =
    (payload.values ?? [])
      .map((row) => ({
        date: row.datetime ?? "",
        close:
          parseNumber(row.close),
      }))
      .filter(
        (
          row,
        ): row is {
          date: string;
          close: number;
        } =>
          row.date.length > 0 &&
          row.date <= targetFriday &&
          row.close !== null,
      )
      .sort(
        (first, second) =>
          second.date.localeCompare(
            first.date,
          ),
      )[0];

  if (!latest) {
    throw new Error(
      `Twelve Data returned no completed daily close through ${targetFriday} for ${symbol}.`,
    );
  }

  return {
    provider: "twelve_data",
    symbol,
    priceDate: latest.date,
    price: latest.close,
    currency: expectedCurrency,
    metadata: {
      endpoint: "time_series",
      interval: "1day",
    },
  };
}

async function fetchBitvavoQuote(
  market: string,
  targetFriday: string,
): Promise<Quote> {
  const payload =
    await fetchJson(
      `https://api.bitvavo.com/v2/${encodeURIComponent(market)}/candles?interval=1d&limit=10`,
      { attempts: 2 },
    ) as Array<
      [
        string | number,
        string,
        string,
        string,
        string,
        string,
      ]
    >;

  if (!Array.isArray(payload)) {
    throw new Error(
      `Bitvavo returned an invalid candle payload for ${market}.`,
    );
  }

  const latest =
    payload
      .map((candle) => {
        const timestamp =
          Number(candle[0]);

        return {
          date:
            formatDateInTimeZone(
              new Date(timestamp),
              "Europe/Amsterdam",
            ),
          close:
            parseNumber(candle[4]),
          timestamp,
        };
      })
      .filter(
        (
          item,
        ): item is {
          date: string;
          close: number;
          timestamp: number;
        } =>
          item.close !== null &&
          Number.isFinite(
            item.timestamp,
          ) &&
          item.date <= targetFriday,
      )
      .sort(
        (first, second) =>
          second.date.localeCompare(
            first.date,
          ),
      )[0];

  if (!latest) {
    throw new Error(
      `Bitvavo returned no completed BTC daily close through ${targetFriday}.`,
    );
  }

  const currency =
    market
      .split("-")
      .at(-1)
      ?.toUpperCase();

  if (
    !currency ||
    currency.length !== 3
  ) {
    throw new Error(
      `Cannot derive quote currency from Bitvavo market ${market}.`,
    );
  }

  return {
    provider: "bitvavo",
    symbol: market,
    priceDate: latest.date,
    price: latest.close,
    currency,
    metadata: {
      candleTimestamp:
        latest.timestamp,
      interval: "1d",
      timeZone:
        "Europe/Amsterdam",
    },
  };
}

async function fetchNbpFx(
  targetFriday: string,
): Promise<FxQuote[]> {
  const startDate =
    addDays(
      targetFriday,
      -7,
    );

  const payload =
    await fetchJson(
      `https://api.nbp.pl/api/exchangerates/tables/A/${startDate}/${targetFriday}/?format=json`,
      { attempts: 2 },
    ) as Array<{
      no?: string;
      effectiveDate?: string;
      rates?: Array<{
        code?: string;
        mid?: number;
      }>;
    }>;

  if (
    !Array.isArray(payload) ||
    payload.length === 0
  ) {
    throw new Error(
      "NBP returned no table A data.",
    );
  }

  const latestTable =
    [...payload]
      .filter(
        (table) =>
          Boolean(
            table.effectiveDate,
          ) &&
          table.effectiveDate! <=
            targetFriday,
      )
      .sort(
        (first, second) =>
          second.effectiveDate!
            .localeCompare(
              first.effectiveDate!,
            ),
      )[0];

  if (
    !latestTable?.effectiveDate
  ) {
    throw new Error(
      `NBP returned no table A through ${targetFriday}.`,
    );
  }

  const result: FxQuote[] = [];

  for (
    const code of [
      "USD",
      "EUR",
    ] as const
  ) {
    const rate =
      latestTable.rates?.find(
        (item) =>
          item.code === code,
      );

    const value =
      parseNumber(rate?.mid);

    if (
      value === null ||
      value <= 0
    ) {
      throw new Error(
        `NBP table ${latestTable.no ?? "A"} has no valid ${code}/PLN rate.`,
      );
    }

    result.push({
      code,
      rateDate:
        latestTable.effectiveDate,
      rate: value,
      tableNo:
        latestTable.no ?? "A",
    });
  }

  return result;
}

async function fetchBySource(
  source: SourceRow,
  instrument: InstrumentRow,
  targetFriday: string,
  eodhdApiKey:
    string | undefined,
  alphaVantageApiKey:
    string | undefined,
  twelveDataApiKey:
    string | undefined,
): Promise<Quote> {
  switch (source.provider) {
    case "eodhd":
      if (!eodhdApiKey) {
        throw new Error(
          "EODHD_API_KEY is not configured.",
        );
      }

      return await fetchEodhdQuote(
        source.provider_symbol,
        targetFriday,
        eodhdApiKey,
        instrument.default_currency,
      );

    case "alpha_vantage":
      if (!alphaVantageApiKey) {
        throw new Error(
          "ALPHA_VANTAGE_API_KEY is not configured.",
        );
      }

      return await fetchAlphaVantageQuote(
        source.provider_symbol,
        targetFriday,
        alphaVantageApiKey,
        instrument.default_currency,
      );

    case "twelve_data":
      if (!twelveDataApiKey) {
        throw new Error(
          "TWELVE_DATA_API_KEY is not configured.",
        );
      }

      return await fetchTwelveDataQuote(
        source.provider_symbol,
        targetFriday,
        twelveDataApiKey,
        instrument.default_currency,
      );

    case "bitvavo":
      return await fetchBitvavoQuote(
        source.provider_symbol,
        targetFriday,
      );
  }
}


async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results =
    new Array<R>(
      items.length,
    );

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index =
        nextIndex;

      nextIndex += 1;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index],
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            items.length,
          ),
      },
      () => runWorker(),
    ),
  );

  return results;
}

async function fetchInstrumentQuote(
  instrument: InstrumentRow,
  sources: SourceRow[],
  targetFriday: string,
  eodhdApiKey:
    string | undefined,
  alphaVantageApiKey:
    string | undefined,
): Promise<InstrumentResult> {
  const errors: string[] = [];

  for (
    const source of sources
      .filter(
        (item) =>
          item.is_enabled,
      )
      .sort(
        (first, second) =>
          first.priority -
          second.priority,
      )
  ) {
    try {
      const quote =
        await fetchBySource(
          source,
          instrument,
          targetFriday,
          eodhdApiKey,
          alphaVantageApiKey,
          twelveDataApiKey,
        );

      if (
        quote.currency !==
        instrument.default_currency
      ) {
        throw new Error(
          `Currency mismatch: provider returned ${quote.currency}, instrument expects ${instrument.default_currency}.`,
        );
      }

      if (
        quote.price <= 0
      ) {
        throw new Error(
          `Invalid non-positive close ${quote.price}.`,
        );
      }

      return {
        instrumentId:
          instrument.id,
        ticker:
          instrument.ticker,
        status: "success",
        quote: {
          ...quote,
          price: roundToMinorUnit(
            quote.price,
          ),
        },
        errors,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const safeMessage =
        sanitizeProviderMessage(
          message,
        );

      errors.push(
        `${source.provider}:${source.provider_symbol}: ${safeMessage}`,
      );
    }
  }

  return {
    instrumentId:
      instrument.id,
    ticker:
      instrument.ticker,
    status: "failed",
    errors,
  };
}

Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    if (
      request.method !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    const cronSecret =
      Deno.env.get(
        "MARKET_SYNC_CRON_SECRET",
      );

    if (!cronSecret) {
      return jsonResponse(
        {
          error:
            "MARKET_SYNC_CRON_SECRET is not configured.",
        },
        500,
      );
    }

    if (
      request.headers.get(
        "x-market-sync-secret",
      ) !== cronSecret
    ) {
      return jsonResponse(
        {
          error: "Unauthorized.",
        },
        401,
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      );

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      return jsonResponse(
        {
          error:
            "Supabase runtime secrets are unavailable.",
        },
        500,
      );
    }

    let body: SyncRequest = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    const now = new Date();
    const warsaw =
      getWarsawParts(now);

    const force =
      body.force === true;

    const dryRun =
      body.dryRun === true;

    const retryFailedOnly =
      body.retryFailedOnly === true;

    if (
      !force &&
      (
        warsaw.weekday !== "Sat" ||
        warsaw.hour !== 8 ||
        warsaw.minute < 5 ||
        warsaw.minute > 20
      )
    ) {
      return jsonResponse({
        status:
          "skipped_outside_warsaw_window",
        warsawNow: warsaw,
      });
    }

    const targetSaturday =
      body.targetSaturday ??
      warsaw.date;

    if (
      !isIsoDate(
        targetSaturday,
      ) ||
      !isSaturday(
        targetSaturday,
      )
    ) {
      return jsonResponse(
        {
          error:
            "targetSaturday must be a valid Saturday in YYYY-MM-DD format.",
        },
        400,
      );
    }

    const targetFriday =
      addDays(
        targetSaturday,
        -1,
      );

    const triggerSource:
      "cron" | "manual" =
      body.trigger === "manual" ||
      force ||
      dryRun
        ? "manual"
        : "cron";

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    const {
      data: allSources,
      error: sourceError,
    } = await supabase
      .from(
        "market_data_instrument_sources",
      )
      .select(
        "workspace_id, instrument_id, provider, provider_symbol, priority, is_enabled",
      )
      .eq(
        "is_enabled",
        true,
      )
      .order(
        "priority",
        { ascending: true },
      );

    if (sourceError) {
      console.error(
        "Market source query failed:",
        sourceError,
      );

      return jsonResponse(
        {
          error:
            "Could not load market source mappings.",
        },
        500,
      );
    }

    const sources =
      (allSources ??
        []) as SourceRow[];

    const workspaceIds =
      [
        ...new Set(
          sources.map(
            (source) =>
              source.workspace_id,
          ),
        ),
      ];

    const eodhdApiKey =
      Deno.env.get(
        "EODHD_API_KEY",
      ) ?? undefined;

    const alphaVantageApiKey =
      Deno.env.get(
        "ALPHA_VANTAGE_API_KEY",
      ) ?? undefined;

    const twelveDataApiKey =
      Deno.env.get(
        "TWELVE_DATA_API_KEY",
      ) ?? undefined;

    let fxQuotes:
      FxQuote[] = [];

    let fxFetchError:
      string | null = null;

    try {
      fxQuotes =
        await fetchNbpFx(
          targetFriday,
        );
    } catch (error) {
      fxFetchError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        "NBP FX fetch failed:",
        fxFetchError,
      );
    }

    const workspaceSummaries:
      Array<
        Record<
          string,
          unknown
        >
      > = [];

    for (
      const workspaceId of
      workspaceIds
    ) {
      const workspaceSources =
        sources.filter(
          (source) =>
            source.workspace_id ===
            workspaceId,
        );

      const {
        data:
          existingCompletedRun,
      } = await supabase
        .from(
          "market_data_sync_runs",
        )
        .select(
          "id, status",
        )
        .eq(
          "workspace_id",
          workspaceId,
        )
        .eq(
          "target_saturday",
          targetSaturday,
        )
        .eq(
          "status",
          "completed",
        )
        .maybeSingle();

      if (
        existingCompletedRun &&
        !force &&
        !dryRun
      ) {
        workspaceSummaries.push({
          workspaceId,
          status:
            "already_completed",
          runId:
            existingCompletedRun.id,
        });

        continue;
      }

      const {
        data: positions,
        error:
          positionsError,
      } = await supabase.rpc(
        "get_portfolio_unit_positions_as_of",
        {
          p_workspace_id:
            workspaceId,
          p_as_of_date:
            targetSaturday,
        },
      );

      if (positionsError) {
        console.error(
          "Unit positions query failed:",
          positionsError,
        );

        workspaceSummaries.push({
          workspaceId,
          status: "failed",
          error:
            "Could not load current unit positions.",
        });

        continue;
      }

      const heldInstrumentIds =
        new Set(
          (positions ?? [])
            .filter(
              (
                position: {
                  instrument_id:
                    string | null;
                  quantity:
                    number | string | null;
                },
              ) =>
                Boolean(
                  position.instrument_id,
                ) &&
                Number(
                  position.quantity ??
                    0,
                ) > 0,
            )
            .map(
              (
                position: {
                  instrument_id:
                    string;
                },
              ) =>
                position.instrument_id,
            ),
        );

      const mappedHeldIds =
        [
          ...new Set(
            workspaceSources
              .filter(
                (source) =>
                  heldInstrumentIds.has(
                    source.instrument_id,
                  ),
              )
              .map(
                (source) =>
                  source.instrument_id,
              ),
          ),
        ];

      let instruments:
        InstrumentRow[] = [];

      if (
        mappedHeldIds.length > 0
      ) {
        const {
          data,
          error,
        } = await supabase
          .from("instruments")
          .select(
            "id, workspace_id, name, ticker, exchange, default_currency, tracking_mode, is_active",
          )
          .eq(
            "workspace_id",
            workspaceId,
          )
          .in(
            "id",
            mappedHeldIds,
          );

        if (error) {
          console.error(
            "Instrument query failed:",
            error,
          );

          workspaceSummaries.push({
            workspaceId,
            status: "failed",
            error:
              "Could not load mapped instruments.",
          });

          continue;
        }

        instruments =
          (data ??
            []) as InstrumentRow[];
      }

      let runId:
        string | null = null;

      if (!dryRun) {
        const {
          data: run,
          error: runError,
        } = await supabase
          .from(
            "market_data_sync_runs",
          )
          .upsert(
            {
              workspace_id:
                workspaceId,
              target_saturday:
                targetSaturday,
              market_data_through_date:
                targetFriday,
              status: "running",
              trigger_source:
                triggerSource,
              instrument_success_count:
                0,
              instrument_failure_count:
                0,
              fx_success_count: 0,
              fx_failure_count: 0,
              started_at:
                new Date()
                  .toISOString(),
              completed_at: null,
              notes: null,
              updated_at:
                new Date()
                  .toISOString(),
            },
            {
              onConflict:
                "workspace_id,target_saturday",
            },
          )
          .select("id")
          .single();

        if (
          runError ||
          !run
        ) {
          console.error(
            "Sync run upsert failed:",
            runError,
          );

          workspaceSummaries.push({
            workspaceId,
            status: "failed",
            error:
              "Could not create market sync run.",
          });

          continue;
        }

        runId = run.id;
      }

      const existingSuccessfulInstrumentIds =
        new Set<string>();

      if (
        retryFailedOnly &&
        !dryRun &&
        runId
      ) {
        const {
          data:
            existingSuccessfulItems,
          error:
            existingSuccessfulItemsError,
        } = await supabase
          .from(
            "market_data_sync_items",
          )
          .select(
            "instrument_id",
          )
          .eq(
            "run_id",
            runId,
          )
          .eq(
            "item_type",
            "instrument",
          )
          .eq(
            "status",
            "success",
          );

        if (
          existingSuccessfulItemsError
        ) {
          console.error(
            "Existing successful sync item query failed:",
            existingSuccessfulItemsError,
          );

          workspaceSummaries.push({
            workspaceId,
            runId,
            status: "failed",
            error:
              "Could not load existing successful market sync items.",
          });

          continue;
        }

        for (
          const item of
          existingSuccessfulItems ??
          []
        ) {
          if (
            item.instrument_id
          ) {
            existingSuccessfulInstrumentIds.add(
              item.instrument_id,
            );
          }
        }
      } else if (
        !dryRun &&
        runId
      ) {
        await supabase
          .from(
            "market_data_sync_items",
          )
          .delete()
          .eq(
            "run_id",
            runId,
          );
      }

      const instrumentsToFetch =
        retryFailedOnly
          ? instruments.filter(
              (instrument) =>
                !existingSuccessfulInstrumentIds.has(
                  instrument.id,
                ),
            )
          : instruments;

      const instrumentResults =
        await mapWithConcurrency(
          instrumentsToFetch,
          6,
          async (
            instrument,
          ) => {
            const instrumentSources =
              workspaceSources.filter(
                (source) =>
                  source.instrument_id ===
                  instrument.id,
              );

            return await fetchInstrumentQuote(
              instrument,
              instrumentSources,
              targetFriday,
              eodhdApiKey,
              alphaVantageApiKey,
            );
          },
        );

      let instrumentSuccessCount =
        retryFailedOnly
          ? existingSuccessfulInstrumentIds.size
          : 0;

      let instrumentFailureCount =
        0;

      for (
        const result of
        instrumentResults
      ) {
        if (
          result.status ===
            "success" &&
          result.quote
        ) {
          instrumentSuccessCount +=
            1;

          if (!dryRun) {
            const quote =
              result.quote;

            const {
              error:
                priceError,
            } = await supabase
              .from(
                "instrument_prices",
              )
              .upsert(
                {
                  workspace_id:
                    workspaceId,
                  instrument_id:
                    result.instrumentId,
                  price_date:
                    quote.priceDate,
                  price:
                    quote.price,
                  currency:
                    quote.currency,
                  source:
                    "automatic",
                  notes:
                    `Weekly market sync for ${targetSaturday}; provider=${quote.provider}; symbol=${quote.symbol}; close_date=${quote.priceDate}.`,
                  updated_at:
                    new Date()
                      .toISOString(),
                },
                {
                  onConflict:
                    "workspace_id,instrument_id,price_date,currency",
                },
              );

            if (priceError) {
              console.error(
                "Instrument price upsert failed:",
                priceError,
              );

              instrumentSuccessCount -=
                1;

              instrumentFailureCount +=
                1;

              if (runId) {
                await supabase
                  .from(
                    "market_data_sync_items",
                  )
                  .upsert(
                    {
                      run_id:
                        runId,
                      workspace_id:
                        workspaceId,
                      item_key:
                        `instrument:${result.instrumentId}`,
                      item_type:
                        "instrument",
                      instrument_id:
                        result.instrumentId,
                      provider:
                        quote.provider,
                      provider_symbol:
                        quote.symbol,
                      status:
                        "failed",
                      error_message:
                        `Database price upsert failed: ${priceError.message}`,
                      raw_metadata:
                        quote.metadata,
                    },
                    {
                      onConflict:
                        "run_id,item_key",
                    },
                  );
              }

              continue;
            }

            if (runId) {
              await supabase
                .from(
                  "market_data_sync_items",
                )
                .upsert(
                  {
                    run_id:
                      runId,
                    workspace_id:
                      workspaceId,
                    item_key:
                      `instrument:${result.instrumentId}`,
                    item_type:
                      "instrument",
                    instrument_id:
                      result.instrumentId,
                    provider:
                      quote.provider,
                    provider_symbol:
                      quote.symbol,
                    source_date:
                      quote.priceDate,
                    value:
                      quote.price,
                    currency:
                      quote.currency,
                    status:
                      "success",
                    error_message:
                      result.errors.length >
                      0
                        ? result.errors.join(
                            " | ",
                          )
                        : null,
                    raw_metadata:
                      quote.metadata,
                  },
                  {
                    onConflict:
                      "run_id,item_key",
                  },
                );
            }
          }
        } else {
          instrumentFailureCount +=
            1;

          if (
            !dryRun &&
            runId
          ) {
            await supabase
              .from(
                "market_data_sync_items",
              )
              .upsert(
                {
                  run_id:
                    runId,
                  workspace_id:
                    workspaceId,
                  item_key:
                    `instrument:${result.instrumentId}`,
                  item_type:
                    "instrument",
                  instrument_id:
                    result.instrumentId,
                  provider:
                    "none",
                  provider_symbol:
                    null,
                  status:
                    "failed",
                  error_message:
                    result.errors.join(
                      " | ",
                    ),
                  raw_metadata: {
                    errors:
                      result.errors,
                  },
                },
                {
                  onConflict:
                    "run_id,item_key",
                },
              );
          }
        }
      }

      let fxSuccessCount = 0;
      let fxFailureCount =
        fxFetchError
          ? 2
          : 0;

      const fxErrors:
        string[] =
          fxFetchError
            ? [
                `NBP: ${fxFetchError}`,
              ]
            : [];

      if (
        fxFetchError &&
        !dryRun &&
        runId
      ) {
        for (
          const code of [
            "USD",
            "EUR",
          ] as const
        ) {
          await supabase
            .from(
              "market_data_sync_items",
            )
            .upsert(
              {
                run_id: runId,
                workspace_id:
                  workspaceId,
                item_key:
                  `fx:${code}/${BASE_CURRENCY}`,
                item_type: "fx",
                instrument_id:
                  null,
                provider: "nbp",
                provider_symbol:
                  `${code}/${BASE_CURRENCY}`,
                source_date:
                  null,
                value: null,
                currency:
                  null,
                status:
                  "failed",
                error_message:
                  fxFetchError,
                raw_metadata: {
                  fromCurrency:
                    code,
                  toCurrency:
                    BASE_CURRENCY,
                },
              },
              {
                onConflict:
                  "run_id,item_key",
              },
            );
        }
      }

      for (
        const fx of fxQuotes
      ) {
        if (dryRun) {
          fxSuccessCount += 1;
          continue;
        }

        const {
          error: fxError,
        } = await supabase
          .from(
            "exchange_rates",
          )
          .upsert(
            {
              workspace_id:
                workspaceId,
              rate_date:
                fx.rateDate,
              from_currency:
                fx.code,
              to_currency:
                BASE_CURRENCY,
              rate:
                fx.rate,
              source:
                "automatic",
              notes:
                `Weekly market sync for ${targetSaturday}; NBP table A ${fx.tableNo}; effective_date=${fx.rateDate}.`,
              updated_at:
                new Date()
                  .toISOString(),
            },
            {
              onConflict:
                "workspace_id,rate_date,from_currency,to_currency",
            },
          );

        if (fxError) {
          fxFailureCount += 1;
          fxErrors.push(
            `${fx.code}/PLN: ${fxError.message}`,
          );
        } else {
          fxSuccessCount += 1;
        }

        if (runId) {
          await supabase
            .from(
              "market_data_sync_items",
            )
            .upsert(
              {
                run_id: runId,
                workspace_id:
                  workspaceId,
                item_key:
                  `fx:${fx.code}/${BASE_CURRENCY}`,
                item_type: "fx",
                instrument_id:
                  null,
                provider: "nbp",
                provider_symbol:
                  `${fx.code}/${BASE_CURRENCY}`,
                source_date:
                  fx.rateDate,
                value:
                  fxError
                    ? null
                    : fx.rate,
                currency:
                  fxError
                    ? null
                    : BASE_CURRENCY,
                status:
                  fxError
                    ? "failed"
                    : "success",
                error_message:
                  fxError
                    ? fxError.message
                    : null,
                raw_metadata: {
                  tableNo:
                    fx.tableNo,
                  fromCurrency:
                    fx.code,
                  toCurrency:
                    BASE_CURRENCY,
                },
              },
              {
                onConflict:
                  "run_id,item_key",
              },
            );
        }
      }

      const finalStatus =
        instrumentFailureCount ===
          0 &&
        fxFailureCount === 0
          ? "completed"
          : instrumentSuccessCount >
                0 ||
              fxSuccessCount > 0
            ? "partial"
            : "failed";

      if (
        !dryRun &&
        runId
      ) {
        const {
          error: finalError,
        } = await supabase
          .from(
            "market_data_sync_runs",
          )
          .update({
            status: finalStatus,
            instrument_success_count:
              instrumentSuccessCount,
            instrument_failure_count:
              instrumentFailureCount,
            fx_success_count:
              fxSuccessCount,
            fx_failure_count:
              fxFailureCount,
            completed_at:
              new Date()
                .toISOString(),
            notes:
              fxErrors.length > 0
                ? fxErrors.join(
                    " | ",
                  )
                : null,
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            runId,
          );

        if (finalError) {
          console.error(
            "Sync run final update failed:",
            finalError,
          );
        }
      }

      workspaceSummaries.push({
        workspaceId,
        runId,
        status:
          dryRun
            ? "dry_run"
            : finalStatus,
        targetSaturday,
        marketDataThrough:
          targetFriday,
        mappedHeldInstrumentCount:
          instruments.length,
        instrumentSuccessCount,
        instrumentFailureCount,
        fxSuccessCount,
        fxFailureCount,
        instrumentResults:
          instrumentResults.map(
            (result) => ({
              ticker:
                result.ticker,
              status:
                result.status,
              provider:
                result.quote
                  ?.provider ??
                null,
              symbol:
                result.quote
                  ?.symbol ??
                null,
              priceDate:
                result.quote
                  ?.priceDate ??
                null,
              price:
                result.quote
                  ?.price ??
                null,
              currency:
                result.quote
                  ?.currency ??
                null,
              errors:
                result.errors,
            }),
          ),
        fxQuotes,
      });
    }

    return jsonResponse({
      status: "ok",
      dryRun,
      force,
      retryFailedOnly,
      warsawNow: warsaw,
      targetSaturday,
      marketDataThrough:
        targetFriday,
      providers: {
        eodhd:
          eodhdApiKey
            ? "configured"
            : "not configured",
        alphaVantage:
          alphaVantageApiKey
            ? "configured"
            : "not configured",
        twelveData:
          twelveDataApiKey
            ? "configured"
            : "not configured",
        bitvavo:
          "public BTC-EUR candles",
        nbp:
          "public table A FX",
      },
      workspaces:
        workspaceSummaries,
    });
  },
);