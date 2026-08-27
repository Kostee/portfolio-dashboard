import type {
  SupabaseClient,
} from "npm:@supabase/supabase-js@2";

export type DailyOpenBackfillRegion =
  | "europe"
  | "us";

export type DailyOpenBackfillInstrument = {
  id: string;
  workspace_id: string;
  ticker: string | null;
  default_currency: string;
};

export type DailyOpenBackfillSource = {
  workspace_id: string;
  instrument_id: string;
  provider: string;
  provider_symbol: string;
  priority: number;
  is_enabled: boolean;
};

type BackfillProgressRow = {
  instrument_id: string;
  coverage_start_date: string | null;
  coverage_end_date: string | null;
  last_attempt_at: string | null;
};

type HistoricalOpenRow = {
  tradingDate: string;
  openPrice: number;
  currency: string;
  metadata: Record<string, unknown>;
};

class ProviderHttpError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);

    this.name =
      "ProviderHttpError";

    this.status =
      status;
  }
}

const BACKFILL_RUNTIME_BUDGET_MS =
  45_000;

const TWELVE_DATA_MIN_INTERVAL_MS =
  8_000;

let twelveDataBackfillNextRequestAt =
  0;

function getLocalParts(
  value: Date,
  timeZone: string,
): {
  weekday: string;
  hour: number;
  minute: number;
} {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      },
    ).formatToParts(
      value,
    );

  const values =
    new Map(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return {
    weekday:
      values.get(
        "weekday",
      ) ?? "",
    hour:
      Number(
        values.get(
          "hour",
        ) ?? "0",
      ),
    minute:
      Number(
        values.get(
          "minute",
        ) ?? "0",
      ),
  };
}

export function isDailyOpenBackfillWindow(
  region: DailyOpenBackfillRegion,
  now: Date,
): boolean {
  const local =
    getLocalParts(
      now,
      region === "europe"
        ? "Europe/Warsaw"
        : "America/New_York",
    );

  if (
    ![
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ].includes(
      local.weekday,
    )
  ) {
    return false;
  }

  if (
    region ===
    "europe"
  ) {
    return (
      local.hour === 12 &&
      local.minute <= 20
    );
  }

  return (
    local.hour === 10 &&
    local.minute >= 15 &&
    local.minute <= 35
  );
}

function shiftIsoDate(
  value: string,
  days: number,
): string {
  const date =
    new Date(
      `${value}T00:00:00Z`,
    );

  date.setUTCDate(
    date.getUTCDate() +
      days,
  );

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function parsePositiveNumber(
  value: unknown,
): number | null {
  const parsed =
    Number(
      value,
    );

  return (
    Number.isFinite(
      parsed,
    ) &&
    parsed > 0
  )
    ? parsed
    : null;
}

function providerMessage(
  payload: unknown,
): string | null {
  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return null;
  }

  const record =
    payload as
      Record<
        string,
        unknown
      >;

  for (
    const key of
    [
      "message",
      "error",
      "detail",
    ]
  ) {
    const value =
      record[key];

    if (
      typeof value ===
        "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

async function fetchProviderJson(
  url: string,
): Promise<unknown> {
  const response =
    await fetch(
      url,
      {
        method:
          "GET",
        headers: {
          Accept:
            "application/json",
        },
        signal:
          AbortSignal.timeout(
            30_000,
          ),
      },
    );

  const text =
    await response.text();

  let payload:
    unknown =
    null;

  try {
    payload =
      text
        ? JSON.parse(
            text,
          )
        : null;
  } catch {
    throw new ProviderHttpError(
      response.status,
      `Provider returned non-JSON HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    throw new ProviderHttpError(
      response.status,
      providerMessage(
        payload,
      ) ??
        `Provider returned HTTP ${response.status}.`,
    );
  }

  return payload;
}

function isRateLimitError(
  error: unknown,
): boolean {
  if (
    error instanceof
      ProviderHttpError &&
    error.status === 429
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : String(
          error,
        );

  return /(?:rate.?limit|quota|credits?|too many requests|api requests? limit)/i.test(
    message,
  );
}

function chooseSource(
  sources:
    DailyOpenBackfillSource[],
  instrumentId: string,
  provider:
    | "eodhd"
    | "twelve_data",
): DailyOpenBackfillSource | null {
  return (
    sources
      .filter(
        (source) =>
          source.instrument_id ===
            instrumentId &&
          source.is_enabled &&
          source.provider ===
            provider,
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.priority -
          second.priority,
      )[0] ??
    null
  );
}

async function waitForTwelveDataSlot():
  Promise<void> {
  const now =
    Date.now();

  const scheduledAt =
    Math.max(
      now,
      twelveDataBackfillNextRequestAt,
    );

  twelveDataBackfillNextRequestAt =
    scheduledAt +
    TWELVE_DATA_MIN_INTERVAL_MS;

  const waitMs =
    scheduledAt -
    now;

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

async function fetchEodhdHistory({
  symbol,
  apiKey,
  from,
  to,
  currency,
}: {
  symbol: string;
  apiKey: string;
  from: string;
  to: string;
  currency: string;
}): Promise<
  HistoricalOpenRow[]
> {
  const params =
    new URLSearchParams({
      api_token:
        apiKey,
      fmt:
        "json",
      from,
      to,
      period:
        "d",
      order:
        "a",
    });

  const payload =
    await fetchProviderJson(
      `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}?${params.toString()}`,
    );

  if (
    !Array.isArray(
      payload,
    )
  ) {
    throw new Error(
      providerMessage(
        payload,
      ) ??
        "EODHD historical endpoint returned an unexpected payload.",
    );
  }

  const rows:
    HistoricalOpenRow[] =
    [];

  for (
    const rawRow of
    payload
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
        Record<
          string,
          unknown
        >;

    const tradingDate =
      typeof row.date ===
        "string"
        ? row.date.slice(
            0,
            10,
          )
        : "";

    const openPrice =
      parsePositiveNumber(
        row.open,
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        tradingDate,
      ) ||
      tradingDate < from ||
      tradingDate > to ||
      openPrice === null
    ) {
      continue;
    }

    rows.push({
      tradingDate,
      openPrice,
      currency,
      metadata: {
        endpoint:
          "historical-eod",
        backfill:
          true,
        requestedFrom:
          from,
        requestedTo:
          to,
      },
    });
  }

  return rows;
}

async function fetchTwelveDataHistory({
  symbol,
  apiKey,
  from,
  to,
  expectedCurrency,
}: {
  symbol: string;
  apiKey: string;
  from: string;
  to: string;
  expectedCurrency: string;
}): Promise<
  HistoricalOpenRow[]
> {
  await waitForTwelveDataSlot();

  const params =
    new URLSearchParams({
      symbol,
      interval:
        "1day",
      start_date:
        from,
      end_date:
        to,
      order:
        "ASC",
      outputsize:
        "5000",
      format:
        "JSON",
      apikey:
        apiKey,
    });

  const payload =
    await fetchProviderJson(
      `https://api.twelvedata.com/time_series?${params.toString()}`,
    );

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    throw new Error(
      "Twelve Data historical endpoint returned an unexpected payload.",
    );
  }

  const record =
    payload as
      Record<
        string,
        unknown
      >;

  if (
    record.status ===
      "error"
  ) {
    const code =
      Number(
        record.code,
      );

    const message =
      providerMessage(
        record,
      ) ??
      "Twelve Data returned an error.";

    if (
      code === 429
    ) {
      throw new ProviderHttpError(
        429,
        message,
      );
    }

    throw new Error(
      message,
    );
  }

  const meta =
    record.meta &&
    typeof record.meta ===
      "object"
      ? record.meta as
          Record<
            string,
            unknown
          >
      : {};

  const providerCurrency =
    typeof meta.currency ===
      "string"
      ? meta.currency
          .trim()
          .toUpperCase()
      : expectedCurrency;

  if (
    providerCurrency !==
    expectedCurrency
  ) {
    throw new Error(
      `Currency mismatch for ${symbol}: provider returned ${providerCurrency}, expected ${expectedCurrency}.`,
    );
  }

  const values =
    Array.isArray(
      record.values,
    )
      ? record.values
      : [];

  const rows:
    HistoricalOpenRow[] =
    [];

  for (
    const rawRow of
    values
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
        Record<
          string,
          unknown
        >;

    const tradingDate =
      typeof row.datetime ===
        "string"
        ? row.datetime.slice(
            0,
            10,
          )
        : "";

    const openPrice =
      parsePositiveNumber(
        row.open,
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        tradingDate,
      ) ||
      tradingDate < from ||
      tradingDate > to ||
      openPrice === null
    ) {
      continue;
    }

    rows.push({
      tradingDate,
      openPrice,
      currency:
        providerCurrency,
      metadata: {
        endpoint:
          "time_series",
        interval:
          "1day",
        backfill:
          true,
        requestedFrom:
          from,
        requestedTo:
          to,
      },
    });
  }

  return rows;
}

export async function runDailyOpenBackfill({
  supabase,
  workspaceId,
  region,
  asOfDate,
  instruments,
  sources,
  eodhdApiKey,
  twelveDataApiKey,
}: {
  supabase:
    SupabaseClient;
  workspaceId: string;
  region:
    DailyOpenBackfillRegion;
  asOfDate: string;
  instruments:
    DailyOpenBackfillInstrument[];
  sources:
    DailyOpenBackfillSource[];
  eodhdApiKey:
    string | undefined;
  twelveDataApiKey:
    string | undefined;
}): Promise<
  Record<
    string,
    unknown
  >
> {
  const coverageStartDate =
    `${asOfDate.slice(0, 4)}-01-01`;

  const coverageEndDate =
    shiftIsoDate(
      asOfDate,
      -1,
    );

  if (
    coverageEndDate <
    coverageStartDate
  ) {
    return {
      status:
        "nothing_to_backfill",
      workspaceId,
      region,
      coverageStartDate,
      coverageEndDate,
    };
  }

  const provider =
    region === "europe"
      ? "eodhd"
      : "twelve_data";

  const instrumentIds =
    instruments.map(
      (instrument) =>
        instrument.id,
    );

  if (
    instrumentIds.length ===
    0
  ) {
    return {
      status:
        "no_instruments",
      workspaceId,
      region,
      coverageStartDate,
      coverageEndDate,
    };
  }

  const {
    data:
      progressData,
    error:
      progressError,
  } =
    await supabase
      .from(
        "daily_market_open_backfill_progress",
      )
      .select(
        "instrument_id, coverage_start_date, coverage_end_date, last_attempt_at",
      )
      .eq(
        "workspace_id",
        workspaceId,
      )
      .in(
        "instrument_id",
        instrumentIds,
      );

  if (
    progressError
  ) {
    throw new Error(
      `Could not load daily-open backfill progress: ${progressError.message}`,
    );
  }

  const progressByInstrument =
    new Map<
      string,
      BackfillProgressRow
    >(
      (
        progressData ??
        []
      ).map(
        (row) => [
          row.instrument_id,
          row as
            BackfillProgressRow,
        ],
      ),
    );

  const candidates =
    instruments
      .map(
        (instrument) => {
          const source =
            chooseSource(
              sources,
              instrument.id,
              provider,
            );

          const progress =
            progressByInstrument.get(
              instrument.id,
            );

          const requestTo =
            progress
              ?.coverage_start_date &&
            progress
              .coverage_start_date >
              coverageStartDate
              ? shiftIsoDate(
                  progress
                    .coverage_start_date,
                  -1,
                )
              : coverageEndDate;

          return {
            instrument,
            source,
            progress,
            requestFrom:
              coverageStartDate,
            requestTo,
          };
        },
      )
      .filter(
        (candidate) =>
          candidate.source &&
          !(
            candidate.progress
              ?.coverage_start_date &&
            candidate.progress
              .coverage_start_date <=
              coverageStartDate
          ),
      )
      .sort(
        (
          first,
          second,
        ) =>
          (
            first.progress
              ?.last_attempt_at ??
            ""
          ).localeCompare(
            second.progress
              ?.last_attempt_at ??
              "",
          ) ||
          (
            first.instrument
              .ticker ??
            first.instrument.id
          ).localeCompare(
            second.instrument
              .ticker ??
              second.instrument.id,
          ),
      );

  const noSourceCount =
    instruments.filter(
      (instrument) =>
        !chooseSource(
          sources,
          instrument.id,
          provider,
        ),
    ).length;

  if (
    candidates.length ===
    0
  ) {
    return {
      status:
        "complete",
      workspaceId,
      region,
      provider,
      coverageStartDate,
      coverageEndDate,
      noSourceCount,
      pendingCount:
        0,
      attemptedCount:
        0,
      successCount:
        0,
      failureCount:
        0,
    };
  }

  if (
    region === "us"
  ) {
    twelveDataBackfillNextRequestAt =
      Math.max(
        twelveDataBackfillNextRequestAt,
        Date.now() +
          TWELVE_DATA_MIN_INTERVAL_MS,
      );
  }

  const startedAt =
    Date.now();

  let attemptedCount =
    0;

  let successCount =
    0;

  let failureCount =
    0;

  let historicalRowsFetched =
    0;

  let stoppedReason:
    string | null =
    null;

  for (
    const candidate of
    candidates
  ) {
    if (
      Date.now() -
        startedAt >=
      BACKFILL_RUNTIME_BUDGET_MS
    ) {
      stoppedReason =
        "runtime_budget";
      break;
    }

    if (
      !candidate.source
    ) {
      continue;
    }

    attemptedCount +=
      1;

    const attemptedAt =
      new Date()
        .toISOString();

    const {
      error:
        attemptProgressError,
    } =
      await supabase
        .from(
          "daily_market_open_backfill_progress",
        )
        .upsert(
          {
            workspace_id:
              workspaceId,
            instrument_id:
              candidate.instrument.id,
            provider,
            provider_symbol:
              candidate.source
                .provider_symbol,
            last_attempt_at:
              attemptedAt,
            last_error:
              null,
            updated_at:
              attemptedAt,
          },
          {
            onConflict:
              "workspace_id,instrument_id",
          },
        );

    if (
      attemptProgressError
    ) {
      failureCount +=
        1;

      console.error(
        "Daily-open backfill progress write failed:",
        candidate.instrument
          .ticker,
        attemptProgressError,
      );

      continue;
    }

    try {
      let historicalRows:
        HistoricalOpenRow[];

      if (
        region ===
        "europe"
      ) {
        if (
          !eodhdApiKey
        ) {
          throw new Error(
            "EODHD_API_KEY is not configured.",
          );
        }

        historicalRows =
          await fetchEodhdHistory({
            symbol:
              candidate.source
                .provider_symbol,
            apiKey:
              eodhdApiKey,
            from:
              candidate.requestFrom,
            to:
              candidate.requestTo,
            currency:
              candidate.instrument
                .default_currency,
          });
      } else {
        if (
          !twelveDataApiKey
        ) {
          throw new Error(
            "TWELVE_DATA_API_KEY is not configured.",
          );
        }

        historicalRows =
          await fetchTwelveDataHistory({
            symbol:
              candidate.source
                .provider_symbol,
            apiKey:
              twelveDataApiKey,
            from:
              candidate.requestFrom,
            to:
              candidate.requestTo,
            expectedCurrency:
              candidate.instrument
                .default_currency,
          });
      }

      historicalRowsFetched +=
        historicalRows.length;

      if (
        historicalRows.length >
        0
      ) {
        const nowIso =
          new Date()
            .toISOString();

        const {
          error:
            insertError,
        } =
          await supabase
            .from(
              "instrument_daily_open_prices",
            )
            .upsert(
              historicalRows.map(
                (row) => ({
                  workspace_id:
                    workspaceId,
                  instrument_id:
                    candidate.instrument.id,
                  trading_date:
                    row.tradingDate,
                  open_price:
                    row.openPrice,
                  currency:
                    row.currency,
                  provider,
                  provider_symbol:
                    candidate.source
                      .provider_symbol,
                  provider_timestamp:
                    null,
                  fetched_at:
                    nowIso,
                  metadata:
                    row.metadata,
                  updated_at:
                    nowIso,
                }),
              ),
              {
                onConflict:
                  "workspace_id,instrument_id,trading_date",
                ignoreDuplicates:
                  true,
              },
            );

        if (
          insertError
        ) {
          throw new Error(
            `Historical daily-open insert failed: ${insertError.message}`,
          );
        }
      }

      const completedAt =
        new Date()
          .toISOString();

      const {
        error:
          successProgressError,
      } =
        await supabase
          .from(
            "daily_market_open_backfill_progress",
          )
          .upsert(
            {
              workspace_id:
                workspaceId,
              instrument_id:
                candidate.instrument.id,
              provider,
              provider_symbol:
                candidate.source
                  .provider_symbol,
              coverage_start_date:
                coverageStartDate,
              coverage_end_date:
                coverageEndDate,
              last_attempt_at:
                attemptedAt,
              last_success_at:
                completedAt,
              last_error:
                null,
              completed_at:
                completedAt,
              updated_at:
                completedAt,
            },
            {
              onConflict:
                "workspace_id,instrument_id",
            },
          );

      if (
        successProgressError
      ) {
        throw new Error(
          `Backfill completion write failed: ${successProgressError.message}`,
        );
      }

      successCount +=
        1;
    } catch (
      error
    ) {
      failureCount +=
        1;

      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      const failedAt =
        new Date()
          .toISOString();

      const {
        error:
          failureProgressError,
      } =
        await supabase
          .from(
            "daily_market_open_backfill_progress",
          )
          .upsert(
            {
              workspace_id:
                workspaceId,
              instrument_id:
                candidate.instrument.id,
              provider,
              provider_symbol:
                candidate.source
                  .provider_symbol,
              last_attempt_at:
                attemptedAt,
              last_error:
                message.slice(
                  0,
                  1000,
                ),
              updated_at:
                failedAt,
            },
            {
              onConflict:
                "workspace_id,instrument_id",
            },
          );

      if (
        failureProgressError
      ) {
        console.error(
          "Daily-open backfill failure progress write failed:",
          candidate.instrument
            .ticker,
          failureProgressError,
        );
      }

      console.error(
        "Historical daily-open backfill failed:",
        candidate.instrument
          .ticker,
        message,
      );

      if (
        isRateLimitError(
          error,
        )
      ) {
        stoppedReason =
          "provider_rate_limit";

        break;
      }
    }
  }

  return {
    status:
      stoppedReason
        ? "partial"
        : failureCount > 0
          ? "partial"
          : "completed",
    workspaceId,
    region,
    provider,
    coverageStartDate,
    coverageEndDate,
    noSourceCount,
    pendingCount:
      candidates.length,
    attemptedCount,
    successCount,
    failureCount,
    historicalRowsFetched,
    stoppedReason,
    elapsedMs:
      Date.now() -
      startedAt,
  };
}
