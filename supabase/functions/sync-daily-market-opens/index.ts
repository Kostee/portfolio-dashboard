import { createClient } from "npm:@supabase/supabase-js@2";

type MarketRegion = "europe" | "us";
type TriggerSource = "cron" | "manual";

type RequestBody = {
  region?: MarketRegion;
  trigger?: TriggerSource;
  force?: boolean;
  dryRun?: boolean;
};

type InstrumentRow = {
  id: string;
  workspace_id: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  default_currency: string;
  is_active: boolean;
};

type PositionRow = {
  workspace_id: string;
  instrument_id: string;
  quantity: string | number | null;
};

type SourceRow = {
  workspace_id: string;
  instrument_id: string;
  provider: string;
  provider_symbol: string;
  priority: number;
  is_enabled: boolean;
};

type ResultStatus =
  | "success"
  | "skipped_market_closed"
  | "failed"
  | "no_source";

type InstrumentResult = {
  instrumentId: string;
  ticker: string | null;
  status: ResultStatus;
  provider: "eodhd" | "twelve_data" | null;
  providerSymbol: string | null;
  tradingDate: string | null;
  openPrice: number | null;
  currency: string | null;
  providerTimestamp: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};

const EUROPE_EXCHANGES = new Set([
  "GPW",
  "XETRA",
  "LSE",
]);

const US_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
]);

const TWELVE_DATA_MIN_INTERVAL_MS = 8_000;
let twelveDataNextRequestAt = 0;

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

function parseNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getAdminKey(): string | null {
  const legacy =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  if (legacy) {
    return legacy;
  }

  const raw =
    Deno.env.get(
      "SUPABASE_SECRET_KEYS",
    );

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(raw) as
        Record<string, string>;

    return parsed.default ?? null;
  } catch {
    return null;
  }
}

function getLocalParts(
  date: Date,
  timeZone: string,
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
        timeZone,
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
    formatter.formatToParts(date);

  const map = new Map(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  return {
    date:
      `${map.get("year")}-${map.get("month")}-${map.get("day")}`,
    weekday:
      map.get("weekday") ?? "",
    hour:
      Number(map.get("hour") ?? 0),
    minute:
      Number(map.get("minute") ?? 0),
  };
}

function isWeekday(
  weekday: string,
): boolean {
  return [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
  ].includes(weekday);
}

function isCronWindow(
  region: MarketRegion,
  now: Date,
): boolean {
  const timeZone =
    region === "europe"
      ? "Europe/Warsaw"
      : "America/New_York";

  const local =
    getLocalParts(
      now,
      timeZone,
    );

  if (!isWeekday(local.weekday)) {
    return false;
  }

  if (region === "europe") {
    return (
      (
        local.hour === 9 &&
        local.minute >= 30 &&
        local.minute <= 50
      ) ||
      (
        local.hour === 10 &&
        local.minute >= 30 &&
        local.minute <= 50
      ) ||
      (
        local.hour === 12 &&
        local.minute <= 20
      )
    );
  }

  return (
    (
      local.hour === 9 &&
      local.minute >= 35
    ) ||
    (
      local.hour === 10 &&
      local.minute >= 15 &&
      local.minute <= 35
    )
  );
}

function regionTradingDate(
  region: MarketRegion,
  now: Date,
): string {
  return getLocalParts(
    now,
    region === "europe"
      ? "Europe/Warsaw"
      : "America/New_York",
  ).date;
}

function exchangeTimeZone(
  exchange: string | null,
): string {
  switch (exchange) {
    case "GPW":
      return "Europe/Warsaw";
    case "XETRA":
      return "Europe/Berlin";
    case "LSE":
      return "Europe/London";
    case "NASDAQ":
    case "NYSE":
      return "America/New_York";
    default:
      return "UTC";
  }
}

function chunk<T>(
  items: T[],
  size: number,
): T[][] {
  const result: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += size
  ) {
    result.push(
      items.slice(
        index,
        index + size,
      ),
    );
  }

  return result;
}

async function fetchJson(
  url: string,
): Promise<unknown> {
  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal:
          AbortSignal.timeout(30_000),
      },
    );

  const text =
    await response.text();

  let payload: unknown;

  try {
    payload =
      text.length > 0
        ? JSON.parse(text)
        : null;
  } catch {
    throw new Error(
      `Provider returned non-JSON HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    const providerMessage =
      payload &&
      typeof payload === "object"
        ? (
            payload as
              Record<string, unknown>
          ).message
        : null;

    throw new Error(
      providerMessage
        ? String(providerMessage)
        : `Provider returned HTTP ${response.status}.`,
    );
  }

  return payload;
}

async function waitForTwelveDataSlot(): Promise<void> {
  const now = Date.now();

  const scheduledAt =
    Math.max(
      now,
      twelveDataNextRequestAt,
    );

  twelveDataNextRequestAt =
    scheduledAt +
    TWELVE_DATA_MIN_INTERVAL_MS;

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

type EodhdPayloadRow = {
  code?: string;
  timestamp?: number | string;
  gmtoffset?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string;
  previousClose?: number | string;
  change?: number | string;
  change_p?: number | string;
};

async function fetchEodhdBatch(
  symbols: string[],
  apiKey: string,
): Promise<{
  quotes: Map<string, EodhdPayloadRow>;
  errors: Map<string, string>;
}> {
  const quotes =
    new Map<
      string,
      EodhdPayloadRow
    >();

  const errors =
    new Map<
      string,
      string
    >();

  for (
    const batch of chunk(
      symbols,
      20,
    )
  ) {
    const [
      first,
      ...rest
    ] = batch;

    const params =
      new URLSearchParams({
        api_token: apiKey,
        fmt: "json",
      });

    if (rest.length > 0) {
      params.set(
        "s",
        rest.join(","),
      );
    }

    try {
      const payload =
        await fetchJson(
          `https://eodhd.com/api/real-time/${encodeURIComponent(first)}?${params.toString()}`,
        );

      const rows =
        Array.isArray(payload)
          ? payload
          : payload &&
              typeof payload ===
                "object"
            ? [payload]
            : [];

      for (
        const rawRow of rows
      ) {
        if (
          !rawRow ||
          typeof rawRow !==
            "object"
        ) {
          continue;
        }

        const row =
          rawRow as
            EodhdPayloadRow;

        const code =
          String(
            row.code ?? "",
          )
            .trim()
            .toUpperCase();

        if (code) {
          quotes.set(
            code,
            row,
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      for (
        const symbol of batch
      ) {
        errors.set(
          symbol.toUpperCase(),
          message,
        );
      }
    }
  }

  return {
    quotes,
    errors,
  };
}

type TwelveQuotePayload = {
  status?: string;
  code?: number | string;
  message?: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  mic_code?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number | string;
  last_quote_at?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string;
  previous_close?: number | string;
  change?: number | string;
  percent_change?: number | string;
  is_market_open?: boolean;
};

async function fetchTwelveDataOpen(
  symbol: string,
  apiKey: string,
): Promise<TwelveQuotePayload> {
  await waitForTwelveDataSlot();

  const params =
    new URLSearchParams({
      symbol,
      apikey: apiKey,
    });

  const payload =
    await fetchJson(
      `https://api.twelvedata.com/quote?${params.toString()}`,
    );

  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(
      `Twelve Data returned an invalid quote payload for ${symbol}.`,
    );
  }

  const quote =
    payload as
      TwelveQuotePayload;

  if (
    quote.status === "error" ||
    quote.message
  ) {
    throw new Error(
      quote.message ??
        `Twelve Data returned an error for ${symbol}.`,
    );
  }

  return quote;
}

function buildHeldInstrumentIds(
  positions: PositionRow[],
): Set<string> {
  const totals =
    new Map<string, number>();

  for (
    const position of positions
  ) {
    const key =
      `${position.workspace_id}:${position.instrument_id}`;

    const quantity =
      Number(
        position.quantity ?? 0,
      );

    totals.set(
      key,
      (
        totals.get(key) ??
        0
      ) + quantity,
    );
  }

  const held =
    new Set<string>();

  for (
    const [
      key,
      quantity,
    ] of totals
  ) {
    if (quantity > 0) {
      held.add(key);
    }
  }

  return held;
}

function chooseSource(
  sources: SourceRow[],
  instrumentId: string,
  provider:
    | "eodhd"
    | "twelve_data",
): SourceRow | null {
  return (
    sources
      .filter(
        (source) =>
          source.instrument_id ===
            instrumentId &&
          source.provider ===
            provider &&
          source.is_enabled,
      )
      .sort(
        (first, second) =>
          first.priority -
          second.priority,
      )[0] ?? null
  );
}

function makeFailure(
  instrument: InstrumentRow,
  provider:
    | "eodhd"
    | "twelve_data"
    | null,
  providerSymbol:
    | string
    | null,
  message: string,
  status:
    | "failed"
    | "no_source" =
      "failed",
): InstrumentResult {
  return {
    instrumentId:
      instrument.id,
    ticker:
      instrument.ticker,
    status,
    provider,
    providerSymbol,
    tradingDate: null,
    openPrice: null,
    currency: null,
    providerTimestamp: null,
    errorMessage: message,
    metadata: {},
  };
}

async function processEurope(
  instruments: InstrumentRow[],
  sources: SourceRow[],
  targetDate: string,
  eodhdApiKey:
    | string
    | undefined,
): Promise<InstrumentResult[]> {
  const sourcePairs =
    instruments.map(
      (instrument) => ({
        instrument,
        source:
          chooseSource(
            sources,
            instrument.id,
            "eodhd",
          ),
      }),
    );

  const results:
    InstrumentResult[] = [];

  for (
    const pair of sourcePairs
  ) {
    if (!pair.source) {
      results.push(
        makeFailure(
          pair.instrument,
          null,
          null,
          "No enabled EODHD mapping is configured for this held European instrument.",
          "no_source",
        ),
      );
    }
  }

  const withSources =
    sourcePairs.filter(
      (
        pair,
      ): pair is {
        instrument:
          InstrumentRow;
        source: SourceRow;
      } =>
        pair.source !== null,
    );

  if (
    withSources.length === 0
  ) {
    return results;
  }

  if (!eodhdApiKey) {
    for (
      const pair of withSources
    ) {
      results.push(
        makeFailure(
          pair.instrument,
          "eodhd",
          pair.source
            .provider_symbol,
          "EODHD_API_KEY is not configured.",
        ),
      );
    }

    return results;
  }

  const {
    quotes,
    errors,
  } =
    await fetchEodhdBatch(
      withSources.map(
        (pair) =>
          pair.source
            .provider_symbol,
      ),
      eodhdApiKey,
    );

  for (
    const pair of withSources
  ) {
    const symbol =
      pair.source
        .provider_symbol;

    const normalizedSymbol =
      symbol.toUpperCase();

    const quote =
      quotes.get(
        normalizedSymbol,
      );

    if (!quote) {
      results.push(
        makeFailure(
          pair.instrument,
          "eodhd",
          symbol,
          errors.get(
            normalizedSymbol,
          ) ??
            `EODHD returned no quote for ${symbol}.`,
        ),
      );
      continue;
    }

    const openPrice =
      parseNumber(
        quote.open,
      );

    const timestamp =
      parseNumber(
        quote.timestamp,
      );

    if (
      openPrice === null ||
      openPrice <= 0
    ) {
      results.push(
        makeFailure(
          pair.instrument,
          "eodhd",
          symbol,
          `EODHD returned an invalid open for ${symbol}.`,
        ),
      );
      continue;
    }

    if (
      timestamp === null ||
      timestamp <= 0
    ) {
      results.push(
        makeFailure(
          pair.instrument,
          "eodhd",
          symbol,
          `EODHD returned an invalid timestamp for ${symbol}.`,
        ),
      );
      continue;
    }

    const providerDate =
      getLocalParts(
        new Date(
          timestamp * 1000,
        ),
        exchangeTimeZone(
          pair.instrument
            .exchange,
        ),
      ).date;

    const providerTimestamp =
      new Date(
        timestamp * 1000,
      ).toISOString();

    if (
      providerDate !==
      targetDate
    ) {
      results.push({
        instrumentId:
          pair.instrument.id,
        ticker:
          pair.instrument
            .ticker,
        status:
          "skipped_market_closed",
        provider: "eodhd",
        providerSymbol:
          symbol,
        tradingDate:
          providerDate,
        openPrice: null,
        currency:
          pair.instrument
            .default_currency,
        providerTimestamp,
        errorMessage:
          `Latest EODHD quote belongs to ${providerDate}, expected ${targetDate}.`,
        metadata: {
          endpoint:
            "real-time",
          quoteDate:
            providerDate,
        },
      });
      continue;
    }

    results.push({
      instrumentId:
        pair.instrument.id,
      ticker:
        pair.instrument.ticker,
      status: "success",
      provider: "eodhd",
      providerSymbol:
        symbol,
      tradingDate:
        targetDate,
      openPrice,
      currency:
        pair.instrument
          .default_currency,
      providerTimestamp,
      errorMessage: null,
      metadata: {
        endpoint:
          "real-time",
        gmtoffset:
          parseNumber(
            quote.gmtoffset,
          ),
        high:
          parseNumber(
            quote.high,
          ),
        low:
          parseNumber(
            quote.low,
          ),
        latestDelayedPrice:
          parseNumber(
            quote.close,
          ),
        volume:
          parseNumber(
            quote.volume,
          ),
        previousClose:
          parseNumber(
            quote.previousClose,
          ),
        change:
          parseNumber(
            quote.change,
          ),
        changePercent:
          parseNumber(
            quote.change_p,
          ),
      },
    });
  }

  return results;
}

async function processUs(
  instruments: InstrumentRow[],
  sources: SourceRow[],
  targetDate: string,
  twelveDataApiKey:
    | string
    | undefined,
): Promise<InstrumentResult[]> {
  const results:
    InstrumentResult[] = [];

  for (
    const instrument of
      instruments
  ) {
    const source =
      chooseSource(
        sources,
        instrument.id,
        "twelve_data",
      );

    if (!source) {
      results.push(
        makeFailure(
          instrument,
          null,
          null,
          "No enabled Twelve Data mapping is configured for this held U.S. instrument.",
          "no_source",
        ),
      );
      continue;
    }

    if (!twelveDataApiKey) {
      results.push(
        makeFailure(
          instrument,
          "twelve_data",
          source.provider_symbol,
          "TWELVE_DATA_API_KEY is not configured.",
        ),
      );
      continue;
    }

    try {
      const quote =
        await fetchTwelveDataOpen(
          source.provider_symbol,
          twelveDataApiKey,
        );

      const openPrice =
        parseNumber(
          quote.open,
        );

      if (
        openPrice === null ||
        openPrice <= 0
      ) {
        throw new Error(
          `Twelve Data returned an invalid open for ${source.provider_symbol}.`,
        );
      }

      const currency =
        String(
          quote.currency ??
            instrument
              .default_currency,
        ).toUpperCase();

      if (
        currency !==
        instrument
          .default_currency
      ) {
        throw new Error(
          `Currency mismatch for ${source.provider_symbol}: provider returned ${currency}, expected ${instrument.default_currency}.`,
        );
      }

      const providerDate =
        String(
          quote.datetime ?? "",
        ).slice(0, 10);

      const timestamp =
        parseNumber(
          quote.last_quote_at,
        ) ??
        parseNumber(
          quote.timestamp,
        );

      const providerTimestamp =
        timestamp &&
        timestamp > 0
          ? new Date(
              timestamp * 1000,
            ).toISOString()
          : null;

      if (
        providerDate !==
        targetDate
      ) {
        results.push({
          instrumentId:
            instrument.id,
          ticker:
            instrument.ticker,
          status:
            "skipped_market_closed",
          provider:
            "twelve_data",
          providerSymbol:
            source
              .provider_symbol,
          tradingDate:
            providerDate || null,
          openPrice: null,
          currency,
          providerTimestamp,
          errorMessage:
            `Latest Twelve Data quote belongs to ${providerDate || "unknown"}, expected ${targetDate}.`,
          metadata: {
            endpoint: "quote",
            isMarketOpen:
              quote.is_market_open ??
              null,
          },
        });
        continue;
      }

      results.push({
        instrumentId:
          instrument.id,
        ticker:
          instrument.ticker,
        status: "success",
        provider:
          "twelve_data",
        providerSymbol:
          source
            .provider_symbol,
        tradingDate:
          targetDate,
        openPrice,
        currency,
        providerTimestamp,
        errorMessage: null,
        metadata: {
          endpoint: "quote",
          exchange:
            quote.exchange ??
            null,
          micCode:
            quote.mic_code ??
            null,
          isMarketOpen:
            quote.is_market_open ??
            null,
          dailyTimestamp:
            parseNumber(
              quote.timestamp,
            ),
          lastQuoteAt:
            parseNumber(
              quote.last_quote_at,
            ),
          high:
            parseNumber(
              quote.high,
            ),
          low:
            parseNumber(
              quote.low,
            ),
          latestPrice:
            parseNumber(
              quote.close,
            ),
          volume:
            parseNumber(
              quote.volume,
            ),
          previousClose:
            parseNumber(
              quote.previous_close,
            ),
          change:
            parseNumber(
              quote.change,
            ),
          percentChange:
            parseNumber(
              quote.percent_change,
            ),
        },
      });
    } catch (error) {
      results.push(
        makeFailure(
          instrument,
          "twelve_data",
          source.provider_symbol,
          error instanceof Error
            ? error.message
            : String(error),
        ),
      );
    }
  }

  return results;
}

function getRunStatus(
  results:
    InstrumentResult[],
):
  | "completed"
  | "partial"
  | "failed"
  | "skipped_market_closed" {
  const success =
    results.filter(
      (item) =>
        item.status ===
        "success",
    ).length;

  const skipped =
    results.filter(
      (item) =>
        item.status ===
        "skipped_market_closed",
    ).length;

  const failures =
    results.length -
    success -
    skipped;

  if (
    results.length > 0 &&
    success ===
      results.length
  ) {
    return "completed";
  }

  if (
    results.length > 0 &&
    skipped ===
      results.length
  ) {
    return "skipped_market_closed";
  }

  if (success > 0) {
    return "partial";
  }

  if (
    failures === 0 &&
    skipped > 0
  ) {
    return "skipped_market_closed";
  }

  return "failed";
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

    const expectedSecret =
      Deno.env.get(
        "MARKET_SYNC_CRON_SECRET",
      );

    const providedSecret =
      request.headers.get(
        "x-market-sync-secret",
      );

    if (
      !expectedSecret ||
      !providedSecret ||
      providedSecret !==
        expectedSecret
    ) {
      return jsonResponse(
        {
          error:
            "Unauthorized.",
        },
        401,
      );
    }

    let body: RequestBody = {};

    try {
      body =
        await request.json();
    } catch {
      body = {};
    }

    const region =
      body.region;

    if (
      region !== "europe" &&
      region !== "us"
    ) {
      return jsonResponse(
        {
          error:
            'Body field "region" must be "europe" or "us".',
        },
        400,
      );
    }

    const trigger =
      body.trigger === "cron"
        ? "cron"
        : "manual";

    const force =
      body.force === true;

    const dryRun =
      body.dryRun === true;

    const now =
      new Date();

    if (
      trigger === "cron" &&
      !force &&
      !isCronWindow(
        region,
        now,
      )
    ) {
      return jsonResponse({
        status:
          "skipped_outside_local_window",
        region,
        now:
          now.toISOString(),
      });
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      );

    const adminKey =
      getAdminKey();

    if (
      !supabaseUrl ||
      !adminKey
    ) {
      return jsonResponse(
        {
          error:
            "Supabase admin environment is not configured.",
        },
        500,
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        adminKey,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const targetDate =
      regionTradingDate(
        region,
        now,
      );

    const {
      data:
        rawPositions,
      error:
        positionsError,
    } = await supabase
      .from(
        "portfolio_current_valued_unit_positions",
      )
      .select(
        "workspace_id, instrument_id, quantity",
      );

    if (positionsError) {
      console.error(
        "Current position query failed:",
        positionsError,
      );

      return jsonResponse(
        {
          error:
            "Could not load current held positions.",
        },
        500,
      );
    }

    const positions =
      (
        rawPositions ?? []
      ) as PositionRow[];

    const heldKeys =
      buildHeldInstrumentIds(
        positions,
      );

    const heldInstrumentIds =
      [
        ...new Set(
          positions
            .filter(
              (position) =>
                heldKeys.has(
                  `${position.workspace_id}:${position.instrument_id}`,
                ),
            )
            .map(
              (position) =>
                position.instrument_id,
            ),
        ),
      ];

    if (
      heldInstrumentIds.length ===
      0
    ) {
      return jsonResponse({
        status:
          "no_held_instruments",
        region,
        targetDate,
      });
    }

    const {
      data:
        rawInstruments,
      error:
        instrumentsError,
    } = await supabase
      .from("instruments")
      .select(
        "id, workspace_id, name, ticker, exchange, default_currency, is_active",
      )
      .in(
        "id",
        heldInstrumentIds,
      );

    if (instrumentsError) {
      console.error(
        "Instrument query failed:",
        instrumentsError,
      );

      return jsonResponse(
        {
          error:
            "Could not load held instruments.",
        },
        500,
      );
    }

    const allInstruments =
      (
        rawInstruments ?? []
      ) as InstrumentRow[];

    const allowedExchanges =
      region === "europe"
        ? EUROPE_EXCHANGES
        : US_EXCHANGES;

    const instruments =
      allInstruments.filter(
        (instrument) =>
          instrument.is_active &&
          instrument.exchange !==
            null &&
          allowedExchanges.has(
            instrument.exchange,
          ) &&
          heldKeys.has(
            `${instrument.workspace_id}:${instrument.id}`,
          ),
      );

    if (
      instruments.length ===
      0
    ) {
      return jsonResponse({
        status:
          "no_held_instruments_in_region",
        region,
        targetDate,
      });
    }

    const eligibleIds =
      instruments.map(
        (instrument) =>
          instrument.id,
      );

    const {
      data: rawSources,
      error: sourceError,
    } = await supabase
      .from(
        "market_data_instrument_sources",
      )
      .select(
        "workspace_id, instrument_id, provider, provider_symbol, priority, is_enabled",
      )
      .in(
        "instrument_id",
        eligibleIds,
      )
      .eq(
        "is_enabled",
        true,
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
      (
        rawSources ?? []
      ) as SourceRow[];

    const workspaceIds =
      [
        ...new Set(
          instruments.map(
            (instrument) =>
              instrument.workspace_id,
          ),
        ),
      ];

    const eodhdApiKey =
      Deno.env.get(
        "EODHD_API_KEY",
      ) ?? undefined;

    const twelveDataApiKey =
      Deno.env.get(
        "TWELVE_DATA_API_KEY",
      ) ?? undefined;

    const summaries:
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
      const workspaceInstruments =
        instruments.filter(
          (instrument) =>
            instrument.workspace_id ===
            workspaceId,
        );

      const workspaceSources =
        sources.filter(
          (source) =>
            source.workspace_id ===
            workspaceId,
        );

      let existingRun:
        {
          id: string;
          status: string;
        } | null = null;

      if (!dryRun) {
        const {
          data,
          error,
        } = await supabase
          .from(
            "daily_market_open_sync_runs",
          )
          .select(
            "id, status",
          )
          .eq(
            "workspace_id",
            workspaceId,
          )
          .eq(
            "market_region",
            region,
          )
          .eq(
            "trading_date",
            targetDate,
          )
          .maybeSingle();

        if (error) {
          console.error(
            "Existing daily open run query failed:",
            error,
          );
        } else {
          existingRun =
            data as
              | {
                  id: string;
                  status: string;
                }
              | null;
        }

        if (
          existingRun?.status ===
            "completed" &&
          !force
        ) {
          summaries.push({
            workspaceId,
            status:
              "already_completed",
            runId:
              existingRun.id,
            targetDate,
            instrumentCount:
              workspaceInstruments.length,
          });

          continue;
        }
      }

      let runId:
        string | null =
          existingRun?.id ??
          null;

      if (!dryRun) {
        const {
          data: run,
          error: runError,
        } = await supabase
          .from(
            "daily_market_open_sync_runs",
          )
          .upsert(
            {
              workspace_id:
                workspaceId,
              market_region:
                region,
              trading_date:
                targetDate,
              status:
                "running",
              trigger_source:
                trigger,
              started_at:
                existingRun
                  ? undefined
                  : now.toISOString(),
              completed_at:
                null,
              notes: null,
              updated_at:
                now.toISOString(),
            },
            {
              onConflict:
                "workspace_id,market_region,trading_date",
            },
          )
          .select("id")
          .single();

        if (
          runError ||
          !run
        ) {
          console.error(
            "Daily open run upsert failed:",
            runError,
          );

          summaries.push({
            workspaceId,
            status:
              "failed_to_create_run",
            targetDate,
          });

          continue;
        }

        runId = run.id;
      }

      let instrumentsToProcess =
        workspaceInstruments;

      if (
        !dryRun &&
        runId &&
        !force
      ) {
        const {
          data:
            successfulItems,
          error:
            successfulItemsError,
        } = await supabase
          .from(
            "daily_market_open_sync_items",
          )
          .select(
            "instrument_id",
          )
          .eq(
            "run_id",
            runId,
          )
          .eq(
            "status",
            "success",
          );

        if (
          successfulItemsError
        ) {
          console.error(
            "Successful daily open item query failed:",
            successfulItemsError,
          );
        } else {
          const successfulIds =
            new Set(
              (
                successfulItems ??
                []
              ).map(
                (item) =>
                  item.instrument_id,
              ),
            );

          instrumentsToProcess =
            workspaceInstruments.filter(
              (instrument) =>
                !successfulIds.has(
                  instrument.id,
                ),
            );
        }
      }

      const results =
        region === "europe"
          ? await processEurope(
              instrumentsToProcess,
              workspaceSources,
              targetDate,
              eodhdApiKey,
            )
          : await processUs(
              instrumentsToProcess,
              workspaceSources,
              targetDate,
              twelveDataApiKey,
            );

      if (
        !dryRun &&
        runId
      ) {
        for (
          const result of
            results
        ) {
          if (
            result.status ===
              "success" &&
            result.openPrice !==
              null &&
            result.currency &&
            result.provider &&
            result.providerSymbol
          ) {
            const {
              error:
                priceError,
            } = await supabase
              .from(
                "instrument_daily_open_prices",
              )
              .upsert(
                {
                  workspace_id:
                    workspaceId,
                  instrument_id:
                    result.instrumentId,
                  trading_date:
                    targetDate,
                  open_price:
                    result.openPrice,
                  currency:
                    result.currency,
                  provider:
                    result.provider,
                  provider_symbol:
                    result.providerSymbol,
                  provider_timestamp:
                    result.providerTimestamp,
                  fetched_at:
                    new Date().toISOString(),
                  metadata:
                    result.metadata,
                  updated_at:
                    new Date().toISOString(),
                },
                {
                  onConflict:
                    "workspace_id,instrument_id,trading_date",
                },
              );

            if (priceError) {
              console.error(
                "Daily open price upsert failed:",
                result.ticker,
                priceError,
              );

              result.status =
                "failed";
              result.errorMessage =
                "Database write for daily open price failed.";
            }
          }

          const {
            error:
              itemError,
          } = await supabase
            .from(
              "daily_market_open_sync_items",
            )
            .upsert(
              {
                run_id:
                  runId,
                workspace_id:
                  workspaceId,
                instrument_id:
                  result.instrumentId,
                status:
                  result.status,
                provider:
                  result.provider,
                provider_symbol:
                  result.providerSymbol,
                trading_date:
                  result.tradingDate,
                open_price:
                  result.openPrice,
                currency:
                  result.currency,
                provider_timestamp:
                  result.providerTimestamp,
                error_message:
                  result.errorMessage,
                metadata:
                  result.metadata,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "run_id,instrument_id",
              },
            );

          if (itemError) {
            console.error(
              "Daily open sync item upsert failed:",
              result.ticker,
              itemError,
            );
          }
        }
      }

      let successCount = 0;
      let skippedCount = 0;
      let failureCount = 0;
      let status:
        | "completed"
        | "partial"
        | "failed"
        | "skipped_market_closed";

      if (
        !dryRun &&
        runId
      ) {
        const {
          data: allItems,
          error:
            allItemsError,
        } = await supabase
          .from(
            "daily_market_open_sync_items",
          )
          .select(
            "status",
          )
          .eq(
            "run_id",
            runId,
          );

        if (allItemsError) {
          console.error(
            "Daily open item aggregate query failed:",
            allItemsError,
          );
        }

        const statuses =
          (
            allItems ??
            []
          ).map(
            (item) =>
              item.status,
          );

        successCount =
          statuses.filter(
            (itemStatus) =>
              itemStatus ===
              "success",
          ).length;

        skippedCount =
          statuses.filter(
            (itemStatus) =>
              itemStatus ===
              "skipped_market_closed",
          ).length;

        failureCount =
          statuses.length -
          successCount -
          skippedCount;

        if (
          successCount ===
            workspaceInstruments.length &&
          workspaceInstruments.length >
            0
        ) {
          status =
            "completed";
        } else if (
          skippedCount ===
            workspaceInstruments.length &&
          workspaceInstruments.length >
            0
        ) {
          status =
            "skipped_market_closed";
        } else if (
          successCount > 0
        ) {
          status =
            "partial";
        } else {
          status =
            "failed";
        }

        const {
          error:
            finalizeError,
        } = await supabase
          .from(
            "daily_market_open_sync_runs",
          )
          .update({
            status,
            instrument_success_count:
              successCount,
            instrument_skipped_count:
              skippedCount,
            instrument_failure_count:
              failureCount,
            completed_at:
              new Date().toISOString(),
            notes:
              region === "europe"
                ? "Daily European market opens fetched from EODHD Live (Delayed). Successful instruments are not fetched again on later retries."
                : "Daily U.S. market opens fetched from Twelve Data quote. Successful instruments are not fetched again on later retries.",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            runId,
          );

        if (finalizeError) {
          console.error(
            "Daily open run finalize failed:",
            finalizeError,
          );
        }
      } else {
        successCount =
          results.filter(
            (item) =>
              item.status ===
              "success",
          ).length;

        skippedCount =
          results.filter(
            (item) =>
              item.status ===
              "skipped_market_closed",
          ).length;

        failureCount =
          results.length -
          successCount -
          skippedCount;

        status =
          getRunStatus(
            results,
          );
      }

      summaries.push({
        workspaceId,
        runId,
        region,
        targetDate,
        dryRun,
        status,
        instrumentCount:
          workspaceInstruments.length,
        attemptedCount:
          results.length,
        successCount,
        skippedCount,
        failureCount,
        items:
          results.map(
            (item) => ({
              ticker:
                item.ticker,
              status:
                item.status,
              provider:
                item.provider,
              providerSymbol:
                item.providerSymbol,
              tradingDate:
                item.tradingDate,
              openPrice:
                item.openPrice,
              currency:
                item.currency,
              error:
                item.errorMessage,
            }),
          ),
      });

    }

    return jsonResponse({
      status: "ok",
      region,
      targetDate,
      trigger,
      dryRun,
      force,
      summaries,
    });
  },
);