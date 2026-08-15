import { createClient } from "npm:@supabase/supabase-js@2";

const WARSAW_TIME_ZONE = "Europe/Warsaw";
const BASE_CURRENCY = "PLN";

const GUS_CPI_CSV_URL =
  "https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultstronaopisowa/4741/1/1/miesieczne_wskazniki_cen_towarow_i_uslug_konsumpcyjnych_od_1982_roku__2_2.csv";

const GUS_CPI_SOURCE_PAGE =
  "https://stat.gov.pl/obszary-tematyczne/ceny-handel/wskazniki-cen/wskazniki-cen-towarow-i-uslug-konsumpcyjnych-pot-inflacja-/miesieczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych-od-1982-roku/";

type RequestBody = {
  force?: boolean;
  dryRun?: boolean;
  targetDate?: string;
};

type BondConfig = {
  id: string;
  workspace_id: string;
  account_id: string;
  instrument_id: string;
  product_type: string;
  purchase_date: string;
  maturity_date: string;
  nominal_value: number | string;
  first_period_rate: number | string;
  margin_rate: number | string;
  quantity_override: number | string | null;
  is_active: boolean;
};

type InterestPeriodRate = {
  config_id: string;
  period_number: number;
  period_start: string;
  period_end: string;
  annual_rate: number | string;
  inflation_rate: number | string | null;
  rate_source: string;
  source_reference: string | null;
};

type PositionRow = {
  workspace_id: string;
  account_id: string;
  instrument_id: string;
  quantity: number | string;
  instrument_currency: string;
};

type PreparedPeriodRate = {
  periodNumber: number;
  periodStart: string;
  periodEnd: string;
  annualRate: number;
  inflationRate: number | null;
  rateSource: "configured" | "gus";
  sourceReference: string | null;
};

type ValuationResult = {
  unitValue: number;
  marketValue: number;
};

type ItemResult = {
  configId: string;
  workspaceId: string;
  accountId: string;
  instrumentId: string;
  status: "success" | "failed";
  quantity?: number;
  unitValue?: number;
  marketValue?: number;
  error?: string;
};

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
      },
    },
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsvLine(
  line: string,
  delimiter = ";",
): string[] {
  const values: string[] = [];

  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (
        quoted &&
        line[index + 1] === '"'
      ) {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (
      character === delimiter &&
      !quoted
    ) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());

  return values;
}

function parsePolishNumber(
  value: string,
): number | null {
  const normalized = value
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();

  if (!normalized) {
    return null;
  }

  const result = Number(normalized);

  return Number.isFinite(result)
    ? result
    : null;
}

function parseIsoDate(
  value: string,
): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      `Invalid ISO date: ${value}`,
    );
  }

  const date = new Date(
    `${value}T00:00:00.000Z`,
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid date: ${value}`,
    );
  }

  return date;
}

function formatIsoDate(
  date: Date,
): string {
  return date
    .toISOString()
    .slice(0, 10);
}

function daysBetween(
  start: Date,
  end: Date,
): number {
  const millisecondsPerDay =
    24 * 60 * 60 * 1000;

  return Math.round(
    (
      end.getTime() -
      start.getTime()
    ) /
      millisecondsPerDay,
  );
}

function lastDayOfMonth(
  year: number,
  monthIndex: number,
): number {
  return new Date(
    Date.UTC(
      year,
      monthIndex + 1,
      0,
    ),
  ).getUTCDate();
}

function addYearsClamped(
  source: Date,
  years: number,
): Date {
  const targetYear =
    source.getUTCFullYear() + years;

  const month =
    source.getUTCMonth();

  const day = Math.min(
    source.getUTCDate(),
    lastDayOfMonth(
      targetYear,
      month,
    ),
  );

  return new Date(
    Date.UTC(
      targetYear,
      month,
      day,
    ),
  );
}

function addMonthsClamped(
  source: Date,
  months: number,
): Date {
  const rawMonth =
    source.getUTCMonth() + months;

  const targetYear =
    source.getUTCFullYear() +
    Math.floor(rawMonth / 12);

  const targetMonth =
    (
      (rawMonth % 12) +
      12
    ) % 12;

  const day = Math.min(
    source.getUTCDate(),
    lastDayOfMonth(
      targetYear,
      targetMonth,
    ),
  );

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
    ),
  );
}

function roundMoney(
  value: number,
): number {
  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) * 100,
    ) / 100
  );
}

function numeric(
  value: number | string,
  fieldName: string,
): number {
  const result = Number(value);

  if (!Number.isFinite(result)) {
    throw new Error(
      `Invalid numeric value for ${fieldName}.`,
    );
  }

  return result;
}

function getWarsawDate(): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          WARSAW_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      "Unable to determine Warsaw date.",
    );
  }

  return `${year}-${month}-${day}`;
}

function isSecondSaturday(
  isoDate: string,
): boolean {
  const date =
    parseIsoDate(isoDate);

  const dayOfMonth =
    date.getUTCDate();

  return (
    date.getUTCDay() === 6 &&
    dayOfMonth >= 8 &&
    dayOfMonth <= 14
  );
}

async function fetchGusCpiCsv():
  Promise<string> {
  const response =
    await fetch(
      GUS_CPI_CSV_URL,
      {
        headers: {
          accept:
            "text/csv,text/plain,*/*",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `GUS CPI request failed with HTTP ${response.status}.`,
    );
  }

  const bytes =
    new Uint8Array(
      await response.arrayBuffer(),
    );

  let text =
    new TextDecoder(
      "utf-8",
    ).decode(bytes);

  if (text.includes("�")) {
    text =
      new TextDecoder(
        "windows-1250",
      ).decode(bytes);
  }

  return text.replace(
    /^\uFEFF/,
    "",
  );
}

function findGusYearOnYearInflation(
  csv: string,
  year: number,
  month: number,
): number {
  if (
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      `Invalid CPI month: ${month}.`,
    );
  }

  for (
    const line
    of csv.split(/\r?\n/)
  ) {
    if (!line.trim()) {
      continue;
    }

    const row =
      parseCsvLine(line);

    if (row.length < 6) {
      continue;
    }

    const measure =
      normalizeText(
        row[2] ?? "",
      );

    if (
      !measure.includes(
        "analogiczny miesiac poprzedniego roku = 100",
      )
    ) {
      continue;
    }

    const rowYear =
      Number(
        (row[3] ?? "").trim(),
      );

    const rowMonth =
      Number(
        (row[4] ?? "").trim(),
      );

    if (
      rowYear !== year ||
      rowMonth !== month
    ) {
      continue;
    }

    const indexValue =
      parsePolishNumber(
        row[5] ?? "",
      );

    if (indexValue === null) {
      throw new Error(
        `Invalid GUS CPI value for ${year}-${String(month).padStart(2, "0")}.`,
      );
    }

    return (
      indexValue - 100
    ) / 100;
  }

  throw new Error(
    `GUS year-on-year CPI not found for ${year}-${String(month).padStart(2, "0")}.`,
  );
}

function getPeriodBounds(
  config: BondConfig,
  periodNumber: number,
): {
  start: Date;
  end: Date;
} {
  const purchaseDate =
    parseIsoDate(
      config.purchase_date,
    );

  const maturityDate =
    parseIsoDate(
      config.maturity_date,
    );

  const start =
    addYearsClamped(
      purchaseDate,
      periodNumber - 1,
    );

  const calculatedEnd =
    addYearsClamped(
      purchaseDate,
      periodNumber,
    );

  const end =
    periodNumber === 10
      ? maturityDate
      : calculatedEnd;

  return {
    start,
    end,
  };
}

async function prepareRates(
  supabase: ReturnType<
    typeof createClient
  >,
  config: BondConfig,
  existingRates:
    InterestPeriodRate[],
  valuationDate: string,
  gusCsv: string,
  dryRun: boolean,
): Promise<
  PreparedPeriodRate[]
> {
  const valuation =
    parseIsoDate(
      valuationDate,
    );

  const purchase =
    parseIsoDate(
      config.purchase_date,
    );

  const maturity =
    parseIsoDate(
      config.maturity_date,
    );

  if (
    valuation.getTime() <
    purchase.getTime()
  ) {
    throw new Error(
      "Valuation date precedes the bond purchase date.",
    );
  }

  const finalDate =
    valuation.getTime() >
      maturity.getTime()
      ? maturity
      : valuation;

  const firstRate =
    numeric(
      config.first_period_rate,
      "first_period_rate",
    );

  const marginRate =
    numeric(
      config.margin_rate,
      "margin_rate",
    );

  const byPeriod =
    new Map<
      number,
      InterestPeriodRate
    >(
      existingRates.map(
        (rate) => [
          rate.period_number,
          rate,
        ],
      ),
    );

  const prepared:
    PreparedPeriodRate[] = [];

  for (
    let periodNumber = 1;
    periodNumber <= 10;
    periodNumber += 1
  ) {
    const {
      start,
      end,
    } = getPeriodBounds(
      config,
      periodNumber,
    );

    if (
      finalDate.getTime() <
      start.getTime()
    ) {
      break;
    }

    let annualRate: number;
    let inflationRate:
      number | null = null;

    let rateSource:
      "configured" | "gus";

    let sourceReference:
      string | null = null;

    if (periodNumber === 1) {
      annualRate =
        firstRate;

      rateSource =
        "configured";
    } else {
      const cached =
        byPeriod.get(
          periodNumber,
        );

      if (cached) {
        annualRate =
          numeric(
            cached.annual_rate,
            "annual_rate",
          );

        inflationRate =
          cached.inflation_rate ===
              null
            ? null
            : numeric(
              cached.inflation_rate,
              "inflation_rate",
            );

        rateSource =
          cached.rate_source ===
              "gus"
            ? "gus"
            : "configured";

        sourceReference =
          cached.source_reference;
      } else {
        /*
         * The EDO rate for a period beginning in month M
         * uses the 12-month CPI rate announced by GUS in
         * the preceding month.
         *
         * The regular monthly CPI announcement concerns
         * the month before the announcement month, so the
         * observation is normally M-2.
         */
        const cpiMonth =
          addMonthsClamped(
            start,
            -2,
          );

        const rawInflation =
          findGusYearOnYearInflation(
            gusCsv,
            cpiMonth
              .getUTCFullYear(),
            cpiMonth
              .getUTCMonth() +
              1,
          );

        inflationRate =
          Math.max(
            0,
            rawInflation,
          );

        annualRate =
          inflationRate +
          marginRate;

        rateSource = "gus";
        sourceReference =
          GUS_CPI_SOURCE_PAGE;
      }
    }

    const result:
      PreparedPeriodRate = {
        periodNumber,
        periodStart:
          formatIsoDate(start),
        periodEnd:
          formatIsoDate(end),
        annualRate,
        inflationRate,
        rateSource,
        sourceReference,
      };

    prepared.push(result);

    if (
      !dryRun &&
      !byPeriod.has(
        periodNumber,
      )
    ) {
      const {
        error,
      } = await supabase
        .from(
          "government_bond_interest_period_rates",
        )
        .upsert(
          {
            config_id:
              config.id,
            period_number:
              periodNumber,
            period_start:
              result.periodStart,
            period_end:
              result.periodEnd,
            annual_rate:
              result.annualRate,
            inflation_rate:
              result.inflationRate,
            rate_source:
              result.rateSource,
            source_reference:
              result.sourceReference,
          },
          {
            onConflict:
              "config_id,period_number",
          },
        );

      if (error) {
        throw new Error(
          `Unable to cache bond period rate: ${error.message}`,
        );
      }
    }
  }

  return prepared;
}

function calculateEdoValue(
  config: BondConfig,
  periodRates:
    PreparedPeriodRate[],
  valuationDate: string,
  quantity: number,
): ValuationResult {
  const nominalValue =
    numeric(
      config.nominal_value,
      "nominal_value",
    );

  const valuation =
    parseIsoDate(
      valuationDate,
    );

  const purchase =
    parseIsoDate(
      config.purchase_date,
    );

  const maturity =
    parseIsoDate(
      config.maturity_date,
    );

  if (
    valuation.getTime() <
    purchase.getTime()
  ) {
    throw new Error(
      "Valuation date precedes purchase date.",
    );
  }

  let principal =
    nominalValue;

  for (
    let periodNumber = 1;
    periodNumber <= 10;
    periodNumber += 1
  ) {
    const rate =
      periodRates.find(
        (entry) =>
          entry.periodNumber ===
          periodNumber,
      );

    if (!rate) {
      throw new Error(
        `Missing rate for interest period ${periodNumber}.`,
      );
    }

    const {
      start,
      end,
    } = getPeriodBounds(
      config,
      periodNumber,
    );

    if (
      valuation.getTime() <
      end.getTime()
    ) {
      const elapsedDays =
        Math.max(
          0,
          daysBetween(
            start,
            valuation,
          ),
        );

      const periodDays =
        daysBetween(
          start,
          end,
        );

      if (periodDays <= 0) {
        throw new Error(
          `Invalid ACT denominator for interest period ${periodNumber}.`,
        );
      }

      const accrued =
        principal *
        (
          1 +
          rate.annualRate *
            (
              elapsedDays /
              periodDays
            )
        );

      const unitValue =
        roundMoney(
          accrued,
        );

      return {
        unitValue,
        marketValue:
          roundMoney(
            unitValue *
            quantity,
          ),
      };
    }

    principal =
      roundMoney(
        principal *
          (
            1 +
            rate.annualRate
          ),
      );

    if (
      periodNumber === 10 ||
      end.getTime() >=
        maturity.getTime()
    ) {
      const unitValue =
        roundMoney(
          principal,
        );

      return {
        unitValue,
        marketValue:
          roundMoney(
            unitValue *
            quantity,
          ),
      };
    }
  }

  throw new Error(
    "Unable to calculate EDO valuation.",
  );
}

async function updateRun(
  supabase: ReturnType<
    typeof createClient
  >,
  workspaceId: string,
  valuationDate: string,
  triggerSource:
    "cron" | "manual",
  status:
    | "running"
    | "completed"
    | "partial"
    | "failed",
  successCount: number,
  failureCount: number,
  notes: string | null,
  completed: boolean,
): Promise<void> {
  const payload = {
    workspace_id:
      workspaceId,
    valuation_date:
      valuationDate,
    status,
    trigger_source:
      triggerSource,
    success_count:
      successCount,
    failure_count:
      failureCount,
    notes,
    completed_at:
      completed
        ? new Date()
          .toISOString()
        : null,
  };

  const {
    error,
  } = await supabase
    .from(
      "government_bond_valuation_runs",
    )
    .upsert(
      payload,
      {
        onConflict:
          "workspace_id,valuation_date",
      },
    );

  if (error) {
    throw new Error(
      `Unable to update bond valuation run: ${error.message}`,
    );
  }
}

Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    if (
      request.method !== "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed.",
        },
        405,
      );
    }

    const expectedSecret =
      Deno.env.get(
        "BOND_VALUATION_CRON_SECRET",
      );

    const suppliedSecret =
      request.headers.get(
        "x-bond-valuation-secret",
      );

    if (
      !expectedSecret ||
      suppliedSecret !==
        expectedSecret
    ) {
      return json(
        {
          error:
            "Unauthorized.",
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
      return json(
        {
          error:
            "Supabase service configuration is unavailable.",
        },
        500,
      );
    }

    let body: RequestBody = {};

    try {
      if (
        request.headers
          .get("content-length") !==
        "0"
      ) {
        const text =
          await request.text();

        if (text.trim()) {
          body =
            JSON.parse(text);
        }
      }
    } catch {
      return json(
        {
          error:
            "Invalid JSON request body.",
        },
        400,
      );
    }

    const force =
      body.force === true;

    const dryRun =
      body.dryRun === true;

    const valuationDate =
      body.targetDate ??
      getWarsawDate();

    try {
      parseIsoDate(
        valuationDate,
      );
    } catch (
      error
    ) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        400,
      );
    }

    if (
      !force &&
      !isSecondSaturday(
        valuationDate,
      )
    ) {
      return json({
        status: "skipped",
        reason:
          "Government bond valuations run only on the second Saturday of the month.",
        valuationDate,
      });
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const {
      data:
        rawConfigs,
      error:
        configsError,
    } = await supabase
      .from(
        "government_bond_valuation_configs",
      )
      .select(
        [
          "id",
          "workspace_id",
          "account_id",
          "instrument_id",
          "product_type",
          "purchase_date",
          "maturity_date",
          "nominal_value",
          "first_period_rate",
          "margin_rate",
          "quantity_override",
          "is_active",
        ].join(","),
      )
      .eq(
        "is_active",
        true,
      );

    if (configsError) {
      return json(
        {
          error:
            configsError.message,
        },
        500,
      );
    }

    const configs =
      (
        rawConfigs ??
        []
      ) as BondConfig[];

    if (
      configs.length === 0
    ) {
      return json({
        status:
          "completed",
        valuationDate,
        dryRun,
        message:
          "No active government bond valuation configurations.",
        items: [],
      });
    }

    const unsupported =
      configs.filter(
        (config) =>
          config.product_type !==
          "edo",
      );

    if (
      unsupported.length > 0
    ) {
      return json(
        {
          error:
            "At least one active configuration uses an unsupported government bond product type.",
        },
        400,
      );
    }

    let gusCsv: string;

    try {
      gusCsv =
        await fetchGusCpiCsv();
    } catch (
      error
    ) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        502,
      );
    }

    const configIds =
      configs.map(
        (config) =>
          config.id,
      );

    const {
      data:
        rawRates,
      error:
        ratesError,
    } = await supabase
      .from(
        "government_bond_interest_period_rates",
      )
      .select(
        [
          "config_id",
          "period_number",
          "period_start",
          "period_end",
          "annual_rate",
          "inflation_rate",
          "rate_source",
          "source_reference",
        ].join(","),
      )
      .in(
        "config_id",
        configIds,
      );

    if (ratesError) {
      return json(
        {
          error:
            ratesError.message,
        },
        500,
      );
    }

    const allRates =
      (
        rawRates ??
        []
      ) as InterestPeriodRate[];

    const workspaceIds = [
      ...new Set(
        configs.map(
          (config) =>
            config.workspace_id,
        ),
      ),
    ];

    const positionsByWorkspace =
      new Map<
        string,
        Map<
          string,
          PositionRow
        >
      >();

    for (
      const workspaceId
      of workspaceIds
    ) {
      const {
        data,
        error,
      } = await supabase.rpc(
        "get_portfolio_unit_positions_as_of",
        {
          p_workspace_id:
            workspaceId,
          p_as_of_date:
            valuationDate,
        },
      );

      if (error) {
        return json(
          {
            error:
              `Unable to read portfolio positions for workspace ${workspaceId}: ${error.message}`,
          },
          500,
        );
      }

      const rows =
        (
          data ??
          []
        ) as PositionRow[];

      const map =
        new Map<
          string,
          PositionRow
        >();

      for (
        const row
        of rows
      ) {
        map.set(
          `${row.account_id}:${row.instrument_id}`,
          row,
        );
      }

      positionsByWorkspace.set(
        workspaceId,
        map,
      );

      if (!dryRun) {
        await updateRun(
          supabase,
          workspaceId,
          valuationDate,
          force
            ? "manual"
            : "cron",
          "running",
          0,
          0,
          null,
          false,
        );
      }
    }

    const results:
      ItemResult[] = [];

    for (
      const config
      of configs
    ) {
      try {
        const position =
          positionsByWorkspace
            .get(
              config.workspace_id,
            )
            ?.get(
              `${config.account_id}:${config.instrument_id}`,
            );

        const quantity =
          config.quantity_override !==
            null
            ? numeric(
              config.quantity_override,
              "quantity_override",
            )
            : position
            ? numeric(
              position.quantity,
              "quantity",
            )
            : null;

        if (
          quantity === null ||
          quantity <= 0
        ) {
          throw new Error(
            "No positive ledger quantity is available for this configured bond position.",
          );
        }

        if (
          position &&
          position.instrument_currency !==
            BASE_CURRENCY
        ) {
          throw new Error(
            "Automatic EDO valuation currently requires a PLN-denominated instrument.",
          );
        }

        const existingRates =
          allRates.filter(
            (rate) =>
              rate.config_id ===
              config.id,
          );

        const preparedRates =
          await prepareRates(
            supabase,
            config,
            existingRates,
            valuationDate,
            gusCsv,
            dryRun,
          );

        const valuation =
          calculateEdoValue(
            config,
            preparedRates,
            valuationDate,
            quantity,
          );

        if (!dryRun) {
          const {
            error,
          } = await supabase
            .from(
              "position_snapshots",
            )
            .upsert(
              {
                workspace_id:
                  config.workspace_id,
                account_id:
                  config.account_id,
                instrument_id:
                  config.instrument_id,
                snapshot_date:
                  valuationDate,
                quantity,
                unit_price:
                  valuation.unitValue,
                market_value:
                  valuation.marketValue,
                currency:
                  BASE_CURRENCY,
                fx_rate_to_base:
                  1,
                market_value_base:
                  valuation.marketValue,
                source:
                  "automatic",
                notes:
                  "Automatic government bond valuation.",
                created_by:
                  null,
              },
              {
                onConflict:
                  "workspace_id,account_id,instrument_id,snapshot_date",
              },
            );

          if (error) {
            throw new Error(
              `Unable to persist position snapshot: ${error.message}`,
            );
          }
        }

        results.push({
          configId:
            config.id,
          workspaceId:
            config.workspace_id,
          accountId:
            config.account_id,
          instrumentId:
            config.instrument_id,
          status:
            "success",
          quantity,
          unitValue:
            valuation.unitValue,
          marketValue:
            valuation.marketValue,
        });
      } catch (
        error
      ) {
        results.push({
          configId:
            config.id,
          workspaceId:
            config.workspace_id,
          accountId:
            config.account_id,
          instrumentId:
            config.instrument_id,
          status:
            "failed",
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    if (!dryRun) {
      for (
        const workspaceId
        of workspaceIds
      ) {
        const workspaceResults =
          results.filter(
            (result) =>
              result.workspaceId ===
              workspaceId,
          );

        const successCount =
          workspaceResults.filter(
            (result) =>
              result.status ===
              "success",
          ).length;

        const failureCount =
          workspaceResults.length -
          successCount;

        const status =
          failureCount === 0
            ? "completed"
            : successCount === 0
            ? "failed"
            : "partial";

        await updateRun(
          supabase,
          workspaceId,
          valuationDate,
          force
            ? "manual"
            : "cron",
          status,
          successCount,
          failureCount,
          failureCount > 0
            ? "One or more automatic government bond valuations failed."
            : null,
          true,
        );
      }
    }

    const successCount =
      results.filter(
        (result) =>
          result.status ===
          "success",
      ).length;

    const failureCount =
      results.length -
      successCount;

    return json({
      status:
        failureCount === 0
          ? "completed"
          : successCount === 0
          ? "failed"
          : "partial",
      valuationDate,
      dryRun,
      forced: force,
      successCount,
      failureCount,
      items: results,
    });
  },
);