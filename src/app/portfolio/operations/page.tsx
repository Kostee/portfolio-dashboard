import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  fetchNbpTableARate,
} from "@/lib/finance/nbp-table-a";
import type { Database } from "@/types/database.types";

import { createCashOperation } from "./actions";
import { getDateInTimeZone } from "./form-helpers";
import {
  CASH_OPERATION_TYPE_LABELS,
  CASH_OPERATION_TYPES,
  OPERATION_CURRENCIES,
  OPERATION_TYPE_LABELS,
} from "./operation-options";

type SearchParamValue =
  | string
  | string[]
  | undefined;

type OperationsPageProps = {
  searchParams: Promise<{
    error?: SearchParamValue;
    success?: SearchParamValue;
    range?: SearchParamValue;
    from?: SearchParamValue;
    to?: SearchParamValue;
    types?: SearchParamValue;
    accounts?: SearchParamValue;
    page?: SearchParamValue;
  }>;
};

type PortfolioOperationSummary = Pick<
  Database["public"]["Tables"]["portfolio_operations"]["Row"],
  | "id"
  | "operation_date"
  | "executed_at"
  | "operation_type"
  | "status"
  | "source"
  | "description"
  | "funding_route_id"
  | "created_at"
>;

type OperationEntrySummary = Pick<
  Database["public"]["Tables"]["portfolio_operation_entries"]["Row"],
  | "id"
  | "operation_id"
  | "sequence_no"
  | "account_id"
  | "instrument_id"
  | "quantity_delta"
  | "cash_delta"
  | "value_delta"
  | "currency"
  | "component"
  | "fx_rate_to_base"
  | "base_cash_delta"
  | "base_value_delta"
>;

type DateRangePreset =
  | "all"
  | "24h"
  | "7d"
  | "30d"
  | "ytd"
  | "12m"
  | "custom";

const FILTER_PAGE_SIZE = 100;
const DATABASE_BATCH_SIZE = 1000;

const DATE_RANGE_OPTIONS: Array<{
  value: DateRangePreset;
  label: string;
}> = [
  {
    value: "all",
    label: "All time",
  },
  {
    value: "24h",
    label: "Last 24 hours",
  },
  {
    value: "7d",
    label: "Last 7 days",
  },
  {
    value: "30d",
    label: "Last 30 days",
  },
  {
    value: "ytd",
    label: "Year to date",
  },
  {
    value: "12m",
    label: "Last 12 months",
  },
  {
    value: "custom",
    label: "Custom range",
  },
];


function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatOperationTime(
  value: string | null,
  timeZone: string,
): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function firstSearchParam(
  value: SearchParamValue,
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function searchParamValues(
  value: SearchParamValue,
): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

function isIsoDate(
  value: string | undefined,
): value is string {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftIsoDate(
  value: string,
  days: number,
): string {
  const date = new Date(
    `${value}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() +
      days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function shiftIsoYear(
  value: string,
  years: number,
): string {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  const targetYear =
    year +
    years;

  const lastDayOfTargetMonth =
    new Date(
      Date.UTC(
        targetYear,
        month,
        0,
      ),
    ).getUTCDate();

  const targetDate =
    new Date(
      Date.UTC(
        targetYear,
        month - 1,
        Math.min(
          day,
          lastDayOfTargetMonth,
        ),
      ),
    );

  return targetDate
    .toISOString()
    .slice(0, 10);
}

function getDateForInstantInTimeZone(
  value: Date,
  timeZone: string,
): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(value);

  const partMap =
    new Map(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return [
    partMap.get("year"),
    partMap.get("month"),
    partMap.get("day"),
  ].join("-");
}

function matchesDateRange(
  operation: PortfolioOperationSummary,
  preset: DateRangePreset,
  today: string,
  workspaceTimeZone: string,
  customFrom: string | undefined,
  customTo: string | undefined,
): boolean {
  if (preset === "all") {
    return true;
  }

  if (preset === "24h") {
    const cutoff =
      new Date(
        Date.now() -
          24 *
            60 *
            60 *
            1000,
      );

    if (operation.executed_at) {
      const executedAt =
        new Date(
          operation.executed_at,
        );

      return (
        executedAt >= cutoff &&
        executedAt <=
          new Date()
      );
    }

    const cutoffDate =
      getDateForInstantInTimeZone(
        cutoff,
        workspaceTimeZone,
      );

    return (
      operation.operation_date >=
        cutoffDate &&
      operation.operation_date <=
        today
    );
  }

  if (preset === "custom") {
    if (
      customFrom &&
      operation.operation_date <
        customFrom
    ) {
      return false;
    }

    if (
      customTo &&
      operation.operation_date >
        customTo
    ) {
      return false;
    }

    return true;
  }

  let startDate =
    today;

  if (preset === "7d") {
    startDate =
      shiftIsoDate(
        today,
        -6,
      );
  } else if (
    preset === "30d"
  ) {
    startDate =
      shiftIsoDate(
        today,
        -29,
      );
  } else if (
    preset === "ytd"
  ) {
    startDate =
      `${today.slice(0, 4)}-01-01`;
  } else if (
    preset === "12m"
  ) {
    startDate =
      shiftIsoYear(
        today,
        -1,
      );
  }

  return (
    operation.operation_date >=
      startDate &&
    operation.operation_date <=
      today
  );
}

async function loadAllOperations(
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
  workspaceId: string,
) {
  const rows:
    PortfolioOperationSummary[] =
    [];

  let from = 0;

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "portfolio_operations",
      )
      .select(
        "id, operation_date, executed_at, operation_type, status, source, description, funding_route_id, created_at",
      )
      .eq(
        "workspace_id",
        workspaceId,
      )
      .order(
        "operation_date",
        {
          ascending: false,
        },
      )
      .order(
        "executed_at",
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .order(
        "id",
        {
          ascending: false,
        },
      )
      .range(
        from,
        from +
          DATABASE_BATCH_SIZE -
          1,
      );

    if (error) {
      return {
        data: rows,
        error,
      };
    }

    const batch =
      (data ??
        []) as PortfolioOperationSummary[];

    rows.push(
      ...batch,
    );

    if (
      batch.length <
      DATABASE_BATCH_SIZE
    ) {
      break;
    }

    from +=
      DATABASE_BATCH_SIZE;
  }

  return {
    data: rows,
    error: null,
  };
}

async function loadAllOperationEntries(
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
  workspaceId: string,
) {
  const rows:
    OperationEntrySummary[] =
    [];

  let from = 0;

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "portfolio_operation_entries",
      )
      .select(
        "id, operation_id, sequence_no, account_id, instrument_id, quantity_delta, cash_delta, value_delta, currency, component, fx_rate_to_base, base_cash_delta, base_value_delta",
      )
      .eq(
        "workspace_id",
        workspaceId,
      )
      .order(
        "operation_id",
        {
          ascending: true,
        },
      )
      .order(
        "sequence_no",
        {
          ascending: true,
        },
      )
      .range(
        from,
        from +
          DATABASE_BATCH_SIZE -
          1,
      );

    if (error) {
      return {
        data: rows,
        error,
      };
    }

    const batch =
      (data ??
        []) as OperationEntrySummary[];

    rows.push(
      ...batch,
    );

    if (
      batch.length <
      DATABASE_BATCH_SIZE
    ) {
      break;
    }

    from +=
      DATABASE_BATCH_SIZE;
  }

  return {
    data: rows,
    error: null,
  };
}

export default async function OperationsPage({
  searchParams,
}: OperationsPageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const resolvedSearchParams =
    await searchParams;

  const errorCode =
    firstSearchParam(
      resolvedSearchParams.error,
    );

  const success =
    firstSearchParam(
      resolvedSearchParams.success,
    );

  const requestedRange =
    firstSearchParam(
      resolvedSearchParams.range,
    );

  const dateRange =
    DATE_RANGE_OPTIONS.some(
      (option) =>
        option.value ===
        requestedRange,
    )
      ? (requestedRange as DateRangePreset)
      : "all";

  const requestedFrom =
    firstSearchParam(
      resolvedSearchParams.from,
    );

  const requestedTo =
    firstSearchParam(
      resolvedSearchParams.to,
    );

  const customFrom =
    isIsoDate(
      requestedFrom,
    )
      ? requestedFrom
      : undefined;

  const customTo =
    isIsoDate(
      requestedTo,
    )
      ? requestedTo
      : undefined;

  const requestedPage =
    Number(
      firstSearchParam(
        resolvedSearchParams.page,
      ) ??
        "1",
    );

  const { data: membership, error: membershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (membershipError) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );
  }

  if (!membership) {
    redirect("/portfolio");
  }

  const [
    workspaceResult,
    ownersResult,
    providersResult,
    accountsResult,
    instrumentsResult,
    operationsResult,
    operationEntriesResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "name, timezone, base_currency",
      )
      .eq(
        "id",
        membership.workspace_id,
      )
      .single(),

    supabase
      .from("owners")
      .select(
        "id, display_name, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("sort_order", {
        ascending: true,
      }),

    supabase
      .from("providers")
      .select("id, name")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, provider_id, name, base_currency, is_active",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("instruments")
      .select("id, name, ticker")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    loadAllOperations(
      supabase,
      membership.workspace_id,
    ),

    loadAllOperationEntries(
      supabase,
      membership.workspace_id,
    ),
  ]);

  const workspace =
    workspaceResult.data;

  const owners =
    ownersResult.data ??
    [];

  const providers =
    providersResult.data ??
    [];

  const accounts =
    accountsResult.data ??
    [];

  const instruments =
    instrumentsResult.data ??
    [];

  const allOperations =
    operationsResult.data;

  const operationEntries =
    operationEntriesResult.data;

  if (workspaceResult.error) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );
  }

  if (ownersResult.error) {
    console.error(
      "Owners query failed:",
      ownersResult.error,
    );
  }

  if (providersResult.error) {
    console.error(
      "Providers query failed:",
      providersResult.error,
    );
  }

  if (accountsResult.error) {
    console.error(
      "Accounts query failed:",
      accountsResult.error,
    );
  }

  if (instrumentsResult.error) {
    console.error(
      "Instruments query failed:",
      instrumentsResult.error,
    );
  }

  if (operationsResult.error) {
    console.error(
      "Operations query failed:",
      operationsResult.error,
    );
  }

  if (
    operationEntriesResult.error
  ) {
    console.error(
      "Operation entries query failed:",
      operationEntriesResult.error,
    );
  }

  const ownerMap = new Map(
    owners.map((owner) => [
      owner.id,
      owner,
    ]),
  );

  const providerMap = new Map(
    providers.map((provider) => [
      provider.id,
      provider,
    ]),
  );

  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      account,
    ]),
  );

  const instrumentMap = new Map(
    instruments.map((instrument) => [
      instrument.id,
      instrument,
    ]),
  );

  const sortedAccounts = [
    ...accounts,
  ].sort((first, second) => {
    const firstOwner =
      ownerMap.get(
        first.owner_id,
      );

    const secondOwner =
      ownerMap.get(
        second.owner_id,
      );

    const ownerOrderDifference =
      (
        firstOwner?.sort_order ??
        999
      ) -
      (
        secondOwner?.sort_order ??
        999
      );

    if (
      ownerOrderDifference !==
      0
    ) {
      return ownerOrderDifference;
    }

    const ownerNameDifference =
      (
        firstOwner?.display_name ??
        ""
      ).localeCompare(
        secondOwner?.display_name ??
          "",
      );

    if (
      ownerNameDifference !==
      0
    ) {
      return ownerNameDifference;
    }

    return first.name.localeCompare(
      second.name,
    );
  });

  const activeAccounts =
    sortedAccounts.filter(
      (account) =>
        account.is_active,
    );

  const entriesByOperation =
    new Map<
      string,
      OperationEntrySummary[]
    >();

  for (
    const entry of
    operationEntries
  ) {
    const entries =
      entriesByOperation.get(
        entry.operation_id,
      ) ??
      [];

    entries.push(
      entry,
    );

    entriesByOperation.set(
      entry.operation_id,
      entries,
    );
  }

  const canEdit =
    membership.role ===
      "admin" ||
    membership.role ===
      "editor";

  const workspaceTimeZone =
    workspace?.timezone ??
    "Europe/Warsaw";

  const workspaceBaseCurrency =
    workspace?.base_currency ??
    "PLN";

  const today =
    getDateInTimeZone(
      workspaceTimeZone,
    );

  const operationTypeOptions =
    Object.entries(
      OPERATION_TYPE_LABELS,
    ) as Array<
      [
        PortfolioOperationSummary["operation_type"],
        string,
      ]
    >;

  const validOperationTypes =
    new Set(
      operationTypeOptions.map(
        ([value]) =>
          value,
      ),
    );

  const selectedOperationTypes =
    searchParamValues(
      resolvedSearchParams.types,
    ).filter(
      (
        value,
      ): value is PortfolioOperationSummary["operation_type"] =>
        validOperationTypes.has(
          value as PortfolioOperationSummary["operation_type"],
        ),
    );

  const validAccountIds =
    new Set(
      accounts.map(
        (account) =>
          account.id,
      ),
    );

  const selectedAccountIds =
    searchParamValues(
      resolvedSearchParams.accounts,
    ).filter(
      (accountId) =>
        validAccountIds.has(
          accountId,
        ),
    );

  const selectedOperationTypeSet =
    new Set(
      selectedOperationTypes,
    );

  const selectedAccountIdSet =
    new Set(
      selectedAccountIds,
    );

  const filteredOperations =
    allOperations.filter(
      (operation) => {
        if (
          selectedOperationTypeSet.size >
            0 &&
          !selectedOperationTypeSet.has(
            operation.operation_type,
          )
        ) {
          return false;
        }

        if (
          !matchesDateRange(
            operation,
            dateRange,
            today,
            workspaceTimeZone,
            customFrom,
            customTo,
          )
        ) {
          return false;
        }

        if (
          selectedAccountIdSet.size >
          0
        ) {
          const entries =
            entriesByOperation.get(
              operation.id,
            ) ??
            [];

          const touchesSelectedAccount =
            entries.some(
              (entry) =>
                selectedAccountIdSet.has(
                  entry.account_id,
                ),
            );

          if (
            !touchesSelectedAccount
          ) {
            return false;
          }
        }

        return true;
      },
    );

  const totalFilteredOperations =
    filteredOperations.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalFilteredOperations /
          FILTER_PAGE_SIZE,
      ),
    );

  const currentPage =
    Number.isFinite(
      requestedPage,
    ) &&
    requestedPage >= 1
      ? Math.min(
          Math.floor(
            requestedPage,
          ),
          totalPages,
        )
      : 1;

  const pageStart =
    (
      currentPage -
      1
    ) *
    FILTER_PAGE_SIZE;

  const operations =
    filteredOperations.slice(
      pageStart,
      pageStart +
        FILTER_PAGE_SIZE,
    );

  const visibleFrom =
    totalFilteredOperations ===
    0
      ? 0
      : pageStart + 1;

  const visibleTo =
    Math.min(
      pageStart +
        FILTER_PAGE_SIZE,
      totalFilteredOperations,
    );

  let purchaseTotal = 0;
  let saleTotal = 0;
  let depositTotal = 0;
  let dividendTotal = 0;
  let netCashTotal = 0;
  let incompleteSummaryOperations =
    0;
  let postedSummaryOperations =
    0;

  const summaryFxCache =
    new Map<string, number>();

  for (
    const operation of
    filteredOperations
  ) {
    if (
      operation.status !==
      "posted"
    ) {
      continue;
    }

    const allEntries =
      entriesByOperation.get(
        operation.id,
      ) ??
      [];

    const summaryEntries =
      selectedAccountIdSet.size >
      0
        ? allEntries.filter(
            (entry) =>
              selectedAccountIdSet.has(
                entry.account_id,
              ),
          )
        : allEntries;

    let operationBaseCash =
      0;

    let hasCashMovement =
      false;

    let canSummarizeOperation =
      true;

    for (
      const entry of
      summaryEntries
    ) {
      const cashDelta =
        Number(
          entry.cash_delta,
        );

      if (
        cashDelta === 0
      ) {
        continue;
      }

      hasCashMovement =
        true;

      if (
        entry.base_cash_delta !==
        null
      ) {
        operationBaseCash +=
          Number(
            entry.base_cash_delta,
          );

        continue;
      }

      if (
        entry.currency ===
        workspaceBaseCurrency
      ) {
        operationBaseCash +=
          cashDelta;

        continue;
      }

      if (
        entry.fx_rate_to_base !==
        null
      ) {
        const storedRate =
          Number(
            entry.fx_rate_to_base,
          );

        if (
          Number.isFinite(
            storedRate,
          ) &&
          storedRate > 0
        ) {
          operationBaseCash +=
            cashDelta *
            storedRate;

          continue;
        }
      }

      if (
        workspaceBaseCurrency ===
          "PLN" &&
        entry.currency
      ) {
        const cacheKey =
          `${entry.currency}|${operation.operation_date}`;

        try {
          let rate =
            summaryFxCache.get(
              cacheKey,
            );

          if (rate === undefined) {
            const fx =
              await fetchNbpTableARate(
                entry.currency,
                operation.operation_date,
                workspaceBaseCurrency,
              );

            rate =
              fx.rateToBase;

            summaryFxCache.set(
              cacheKey,
              rate,
            );
          }

          operationBaseCash +=
            cashDelta *
            rate;

          continue;
        } catch (error) {
          console.error(
            `Operation ${operation.id} cash summary FX fallback failed:`,
            error,
          );
        }
      }

      canSummarizeOperation =
        false;
    }

    if (!hasCashMovement) {
      continue;
    }

    if (
      !canSummarizeOperation
    ) {
      incompleteSummaryOperations +=
        1;

      continue;
    }

    postedSummaryOperations +=
      1;

    netCashTotal +=
      operationBaseCash;

    if (
      operation.operation_type ===
      "buy"
    ) {
      purchaseTotal +=
        Math.abs(
          operationBaseCash,
        );
    } else if (
      operation.operation_type ===
      "sell"
    ) {
      saleTotal +=
        Math.abs(
          operationBaseCash,
        );
    } else if (
      operation.operation_type ===
      "deposit"
    ) {
      depositTotal +=
        Math.max(
          operationBaseCash,
          0,
        );
    } else if (
      operation.operation_type ===
      "dividend"
    ) {
      dividendTotal +=
        Math.max(
          operationBaseCash,
          0,
        );
    }
  }

  const accountsByOwner =
    owners.map(
      (owner) => ({
        owner,
        accounts:
          sortedAccounts.filter(
            (account) =>
              account.owner_id ===
              owner.id,
          ),
      }),
    );

  function buildOperationsHref(
    options?: {
      page?: number;
      accounts?: string[];
    },
  ): string {
    const params =
      new URLSearchParams();

    if (
      dateRange !== "all"
    ) {
      params.set(
        "range",
        dateRange,
      );
    }

    if (
      dateRange ===
      "custom"
    ) {
      if (customFrom) {
        params.set(
          "from",
          customFrom,
        );
      }

      if (customTo) {
        params.set(
          "to",
          customTo,
        );
      }
    }

    for (
      const operationType of
      selectedOperationTypes
    ) {
      params.append(
        "types",
        operationType,
      );
    }

    const accountIds =
      options?.accounts ??
      selectedAccountIds;

    for (
      const accountId of
      accountIds
    ) {
      params.append(
        "accounts",
        accountId,
      );
    }

    if (
      options?.page &&
      options.page >
        1
    ) {
      params.set(
        "page",
        String(
          options.page,
        ),
      );
    }

    const query =
      params.toString();

    return query
      ? `/portfolio/operations?${query}`
      : "/portfolio/operations";
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Portfolio Dashboard
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Portfolio data
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Operations
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <nav className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/portfolio/operations/trade"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Buy or sell
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Record an instrument purchase or sale using the
              actual account cash movement.
            </p>
          </Link>

          <Link
            href="/portfolio/operations/internal-transfer"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Internal transfer
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Move cash between accounts using the
              same currency.
            </p>
          </Link>

          <Link
            href="/portfolio/operations/currency-exchange"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Currency exchange
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Record outgoing and incoming amounts
              in different currencies.
            </p>
          </Link>

          <Link
            href="/portfolio/operations/funding-route"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              External funding route
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Record a contribution routed through
              Walutomat, Revolut or another external
              channel before reaching a portfolio
              account.
            </p>
          </Link>

          <Link
            href="/portfolio/opening-state"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Opening state
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Record assets and cash already held when
              detailed tracking begins.
            </p>
          </Link>

          <Link
            href="/portfolio/state"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Portfolio state
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Review calculated positions, cash balances and
              consistency warnings.
            </p>
          </Link>
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Operations history
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Filter the full ledger by date, operation type and
                  account. Summary values use posted operations only.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {totalFilteredOperations}
              </span>
            </div>

            <form
              method="get"
              className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <label
                    htmlFor="operationsRange"
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                  >
                    Date range
                  </label>

                  <select
                    id="operationsRange"
                    name="range"
                    defaultValue={dateRange}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {DATE_RANGE_OPTIONS.map(
                      (option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="operationsFrom"
                        className="block text-xs text-slate-500"
                      >
                        From
                      </label>

                      <input
                        id="operationsFrom"
                        name="from"
                        type="date"
                        defaultValue={customFrom ?? ""}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="operationsTo"
                        className="block text-xs text-slate-500"
                      >
                        To
                      </label>

                      <input
                        id="operationsTo"
                        name="to"
                        type="date"
                        defaultValue={customTo ?? ""}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] leading-4 text-slate-500">
                    From / To are used when Custom range is selected.
                    Last 24 hours uses exact execution time where available.
                  </p>
                </div>

                <details
                  className="rounded-lg border border-slate-300 bg-white"
                  open={selectedOperationTypes.length > 0}
                >
                  <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-slate-700">
                    Operation types
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {selectedOperationTypes.length === 0
                        ? "All"
                        : `${selectedOperationTypes.length} selected`}
                    </span>
                  </summary>

                  <div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-200 p-3">
                    {operationTypeOptions.map(
                      ([value, label]) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            name="types"
                            value={value}
                            defaultChecked={
                              selectedOperationTypeSet.has(
                                value,
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />

                          <span>
                            {label}
                          </span>
                        </label>
                      ),
                    )}

                    <p className="pt-1 text-[11px] leading-4 text-slate-500">
                      Leave every option unchecked to include all operation
                      types.
                    </p>
                  </div>
                </details>

                <details
                  className="rounded-lg border border-slate-300 bg-white"
                  open={selectedAccountIds.length > 0}
                >
                  <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-slate-700">
                    Accounts
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {selectedAccountIds.length === 0
                        ? "All"
                        : `${selectedAccountIds.length} selected`}
                    </span>
                  </summary>

                  <div className="max-h-80 overflow-y-auto border-t border-slate-200 p-3">
                    {accountsByOwner.map(
                      ({ owner, accounts: ownerAccounts }) =>
                        ownerAccounts.length > 0 ? (
                          <div
                            key={owner.id}
                            className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 [&+&]:pt-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {owner.display_name}
                              </p>

                              <Link
                                href={buildOperationsHref({
                                  accounts: ownerAccounts.map(
                                    (account) => account.id,
                                  ),
                                })}
                                className="text-[11px] font-medium text-blue-700 hover:text-blue-900"
                              >
                                Only {owner.display_name}
                              </Link>
                            </div>

                            <div className="space-y-1">
                              {ownerAccounts.map(
                                (account) => {
                                  const provider =
                                    providerMap.get(
                                      account.provider_id,
                                    );

                                  return (
                                    <label
                                      key={account.id}
                                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                    >
                                      <input
                                        type="checkbox"
                                        name="accounts"
                                        value={account.id}
                                        defaultChecked={
                                          selectedAccountIdSet.has(
                                            account.id,
                                          )
                                        }
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                      />

                                      <span>
                                        {[
                                          provider?.name,
                                          account.name,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}

                                        {!account.is_active && (
                                          <span className="ml-1 text-xs text-slate-400">
                                            inactive
                                          </span>
                                        )}
                                      </span>
                                    </label>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        ) : null,
                    )}

                    <p className="pt-3 text-[11px] leading-4 text-slate-500">
                      Leave every account unchecked to include the entire
                      workspace.
                    </p>
                  </div>
                </details>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">
                  Account filters match operations touching at least one
                  selected account.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/portfolio/operations"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear all
                  </Link>

                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Filtered summary
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Posted cash movements in {workspaceBaseCurrency}.
                    Draft and voided operations are excluded from totals.
                  </p>
                </div>

                <p className="text-xs text-slate-500">
                  {postedSummaryOperations} posted cash{" "}
                  {postedSummaryOperations === 1
                    ? "operation"
                    : "operations"}{" "}
                  summarized
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Matched operations
                  </p>

                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {totalFilteredOperations}
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-700">
                    Purchases
                  </p>

                  <p className="mt-2 text-xl font-semibold text-blue-900">
                    {formatAmount(purchaseTotal)} {workspaceBaseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-emerald-700">
                    Sales
                  </p>

                  <p className="mt-2 text-xl font-semibold text-emerald-900">
                    {formatAmount(saleTotal)} {workspaceBaseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Deposits
                  </p>

                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatAmount(depositTotal)} {workspaceBaseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-violet-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-violet-700">
                    Dividends
                  </p>

                  <p className="mt-2 text-xl font-semibold text-violet-900">
                    {formatAmount(dividendTotal)} {workspaceBaseCurrency}
                  </p>
                </div>

                <div
                  className={
                    netCashTotal >= 0
                      ? "rounded-xl bg-emerald-50 p-4"
                      : "rounded-xl bg-red-50 p-4"
                  }
                >
                  <p
                    className={
                      netCashTotal >= 0
                        ? "text-xs font-medium uppercase tracking-[0.12em] text-emerald-700"
                        : "text-xs font-medium uppercase tracking-[0.12em] text-red-700"
                    }
                  >
                    Net cash
                  </p>

                  <p
                    className={
                      netCashTotal >= 0
                        ? "mt-2 text-xl font-semibold text-emerald-900"
                        : "mt-2 text-xl font-semibold text-red-900"
                    }
                  >
                    {netCashTotal >= 0 ? "+" : ""}
                    {formatAmount(netCashTotal)} {workspaceBaseCurrency}
                  </p>
                </div>
              </div>

              {selectedAccountIds.length > 0 && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Summary cash totals include only entries belonging to the
                  selected accounts. The operation list still shows the full
                  ledger context for each matched operation.
                </p>
              )}

              {incompleteSummaryOperations > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {incompleteSummaryOperations} posted{" "}
                  {incompleteSummaryOperations === 1
                    ? "operation could"
                    : "operations could"}{" "}
                  not be included in cash totals because a non-base-currency
                  cash entry has no stored {workspaceBaseCurrency} value.
                </p>
              )}
            </div>

            <div className="mt-7 flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Matching operations
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {totalFilteredOperations > 0
                    ? `Showing ${visibleFrom}–${visibleTo} of ${totalFilteredOperations}.`
                    : "No operations match the selected filters."}
                </p>
              </div>

              {totalPages > 1 && (
                <p className="text-xs text-slate-500">
                  Page {currentPage} of {totalPages}
                </p>
              )}
            </div>

            {operations.length > 0 ? (
              <ul className="mt-5 divide-y divide-slate-200">
                {operations.map((operation) => {
                  const entries =
                    entriesByOperation.get(
                      operation.id,
                    ) ?? [];

                  const operationTime =
                    formatOperationTime(
                      operation.executed_at,
                      workspaceTimeZone,
                    );

                  const canEditOperation =
                    canEdit &&
                    operation.source === "manual" &&
                    operation.status === "posted" &&
                    (
                      operation.operation_type === "buy" ||
                      operation.operation_type === "sell"
                    ) &&
                    !operation.funding_route_id;

                  return (
                    <li
                      key={operation.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {
                                OPERATION_TYPE_LABELS[
                                  operation
                                    .operation_type
                                ]
                              }
                            </p>

                            {canEditOperation && (
                              <Link
                                href={`/portfolio/operations/${operation.id}/edit`}
                                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                              >
                                Edit
                              </Link>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {operation.operation_date}
                            {operationTime
                              ? ` · ${operationTime}`
                              : ""}
                            {operation.description
                              ? ` · ${operation.description}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {operation.status}
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {operation.source}
                          </span>
                        </div>
                      </div>

                      {entries.length > 0 && (
                        <ul className="mt-4 space-y-2">
                          {entries.map((entry) => {
                            const account = accountMap.get(
                              entry.account_id,
                            );

                            const owner = account
                              ? ownerMap.get(account.owner_id)
                              : undefined;

                            const provider = account
                              ? providerMap.get(account.provider_id)
                              : undefined;

                            const instrument = entry.instrument_id
                              ? instrumentMap.get(entry.instrument_id)
                              : undefined;

                            const cashDelta = Number(
                              entry.cash_delta,
                            );

                            const valueDelta = Number(
                              entry.value_delta,
                            );

                            const quantityDelta = Number(
                              entry.quantity_delta,
                            );

                            const hasQuantityChange =
                              Boolean(instrument) &&
                              quantityDelta !== 0;

                            const accountDescription = account
                              ? [
                                  owner?.display_name,
                                  provider?.name,
                                  account.name,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : "Unknown account";

                            const instrumentDescription = instrument
                              ? [
                                  instrument.ticker,
                                  instrument.name,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : null;

                            const isSelectedAccount =
                              selectedAccountIdSet.size === 0 ||
                              selectedAccountIdSet.has(
                                entry.account_id,
                              );

                            return (
                              <li
                                key={entry.id}
                                className={
                                  isSelectedAccount
                                    ? "flex flex-col gap-3 rounded-lg bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                    : "flex flex-col gap-3 rounded-lg bg-slate-50/60 px-3 py-3 opacity-60 sm:flex-row sm:items-center sm:justify-between"
                                }
                              >
                                <div>
                                  <p className="text-sm text-slate-600">
                                    {accountDescription}
                                  </p>

                                  {hasQuantityChange &&
                                    instrumentDescription && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        {instrumentDescription}
                                      </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  {hasQuantityChange &&
                                    instrument && (
                                      <span
                                        className={
                                          quantityDelta >= 0
                                            ? "w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                                            : "w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                                        }
                                      >
                                        {quantityDelta >= 0 ? "+" : ""}
                                        {formatQuantity(quantityDelta)}{" "}
                                        {instrument.ticker ||
                                          instrument.name}
                                      </span>
                                    )}

                                  {cashDelta !== 0 && (
                                    <span
                                      className={
                                        cashDelta >= 0
                                          ? "w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                          : "w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                                      }
                                    >
                                      {cashDelta >= 0 ? "+" : ""}
                                      {formatAmount(cashDelta)}{" "}
                                      {entry.currency}
                                    </span>
                                  )}

                                  {valueDelta !== 0 &&
                                    entry.component === "adjustment" &&
                                    quantityDelta === 0 &&
                                    cashDelta === 0 && (
                                      <span
                                        className={
                                          valueDelta >= 0
                                            ? "w-fit rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700"
                                            : "w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                                        }
                                      >
                                        {valueDelta >= 0 ? "+" : ""}
                                        {formatAmount(valueDelta)}{" "}
                                        {entry.currency}
                                      </span>
                                    )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No matching operations
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Change or clear the filters to view other portfolio
                  operations.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
                {currentPage > 1 ? (
                  <Link
                    href={buildOperationsHref({
                      page: currentPage - 1,
                    })}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-xs text-slate-500">
                  {visibleFrom}–{visibleTo} of {totalFilteredOperations}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={buildOperationsHref({
                      page: currentPage + 1,
                    })}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add cash operation
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cash operations affect an account
              balance without changing an instrument
              quantity.
            </p>

            {success === "operation_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The operation was posted.
              </p>
            )}

            {errorCode && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The operation could not be posted.
                Check the selected values and server
                log.
              </p>
            )}

            {canEdit &&
            activeAccounts.length > 0 ? (
              <form
                action={createCashOperation}
                className="mt-6 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="operationDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Operation date
                    </label>

                    <input
                      id="operationDate"
                      name="operationDate"
                      type="date"
                      required
                      defaultValue={today}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="operationTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Operation time
                      <span className="ml-1 font-normal text-slate-500">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="operationTime"
                      name="operationTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      {workspaceTimeZone}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="operationType"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Operation type
                  </label>

                  <select
                    id="operationType"
                    name="operationType"
                    defaultValue="deposit"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {CASH_OPERATION_TYPES.map(
                      (operationType) => (
                        <option
                          key={operationType}
                          value={operationType}
                        >
                          {
                            CASH_OPERATION_TYPE_LABELS[
                              operationType
                            ]
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="accountId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account
                  </label>

                  <select
                    id="accountId"
                    name="accountId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select account
                    </option>

                    {activeAccounts.map(
                      (account) => {
                        const owner =
                          ownerMap.get(
                            account.owner_id,
                          );

                        const provider =
                          providerMap.get(
                            account.provider_id,
                          );

                        return (
                          <option
                            key={account.id}
                            value={account.id}
                          >
                            {[
                              owner?.display_name,
                              provider?.name,
                              account.name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </option>
                        );
                      },
                    )}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="amount"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Amount
                    </label>

                    <input
                      id="amount"
                      name="amount"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="500.00"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="currency"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Currency
                    </label>

                    <select
                      id="currency"
                      name="currency"
                      defaultValue="PLN"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    >
                      {OPERATION_CURRENCIES.map(
                        (currency) => (
                          <option
                            key={currency}
                            value={currency}
                          >
                            {currency}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>

                  <input
                    id="description"
                    name="description"
                    type="text"
                    maxLength={250}
                    placeholder="Weekly portfolio contribution"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Post operation
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Operation creation is unavailable.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
