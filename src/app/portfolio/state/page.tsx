import Link from "next/link";
import { redirect } from "next/navigation";

import { StateSnapshotComparisonChart } from "@/components/portfolio/state-snapshot-comparison-chart";
import { createClient } from "@/lib/supabase/server";
import {
  buildStateSnapshotComparison,
  STATE_FOREIGN_ASSET_CLASS_CODES,
  type StateComparisonBaselineItem,
} from "@/lib/portfolio/state-snapshot-comparison";
import type { Database } from "@/types/database.types";

type ValuedUnitPosition =
  Database["public"]["Views"]["portfolio_current_valued_unit_positions"]["Row"];

type CashBalance =
  Database["public"]["Views"]["portfolio_current_cash_balances"]["Row"];

type ReportedBalance =
  Database["public"]["Views"]["portfolio_current_reported_balances"]["Row"];

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getAccountDescription(
  ownerName: string | null,
  providerName: string | null,
  accountName: string | null,
): string {
  return [
    ownerName,
    providerName,
    accountName,
  ]
    .filter(Boolean)
    .join(" · ");
}

type InstrumentRow = Pick<
  Database["public"]["Tables"]["instruments"]["Row"],
  "id" | "name" | "ticker" | "asset_class_id"
>;

type AssetClassRow = Pick<
  Database["public"]["Tables"]["asset_classes"]["Row"],
  "id" | "name" | "code" | "color_hex" | "sort_order"
>;

type InstrumentPositionGroup = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;
  positions: ValuedUnitPosition[];
  totalQuantity: number;
  totalEstimatedBaseValue: number | null;
  valuedPositionCount: number;
  latestValuationDate: string | null;
};

type AssetClassPositionGroup = {
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;
  instruments: InstrumentPositionGroup[];
};

const FALLBACK_ASSET_CLASS_NAME =
  "Unclassified";

const FALLBACK_ASSET_CLASS_COLOR =
  "#64748b";

function getEstimatedPositionBaseValue(
  position: ValuedUnitPosition,
  workspaceBaseCurrency: string,
): number | null {
  const quantity = Number(
    position.quantity ?? 0,
  );

  const valuationBaseValue =
    position.valuation_market_value_base ===
    null
      ? null
      : Number(
          position.valuation_market_value_base,
        );

  const valuationQuantity =
    position.valuation_quantity === null
      ? null
      : Number(
          position.valuation_quantity,
        );

  const valuationUnitPrice =
    position.valuation_unit_price === null
      ? null
      : Number(
          position.valuation_unit_price,
        );

  if (
    position.valuation_status === "matched" &&
    valuationBaseValue !== null
  ) {
    return valuationBaseValue;
  }

  if (
    valuationBaseValue !== null &&
    valuationQuantity !== null &&
    valuationQuantity !== 0
  ) {
    return (
      quantity *
      (valuationBaseValue /
        valuationQuantity)
    );
  }

  if (
    valuationUnitPrice !== null &&
    position.valuation_currency ===
      workspaceBaseCurrency
  ) {
    return quantity * valuationUnitPrice;
  }

  return null;
}

function buildAssetClassPositionGroups(
  positions: ValuedUnitPosition[],
  instruments: InstrumentRow[],
  assetClasses: AssetClassRow[],
  workspaceBaseCurrency: string,
): AssetClassPositionGroup[] {
  const instrumentMap = new Map(
    instruments.map((instrument) => [
      instrument.id,
      instrument,
    ]),
  );

  const assetClassMap = new Map(
    assetClasses.map((assetClass) => [
      assetClass.id,
      assetClass,
    ]),
  );

  const groupedPositions = new Map<
    string,
    ValuedUnitPosition[]
  >();

  for (const position of positions) {
    if (!position.instrument_id) {
      continue;
    }

    const current =
      groupedPositions.get(
        position.instrument_id,
      ) ?? [];

    current.push(position);

    groupedPositions.set(
      position.instrument_id,
      current,
    );
  }

  const instrumentGroups = Array.from(
    groupedPositions.entries(),
  ).map(
    ([instrumentId, grouped]) => {
      const sortedPositions = [...grouped].sort(
        (first, second) =>
          getAccountDescription(
            first.owner_name,
            first.provider_name,
            first.account_name,
          ).localeCompare(
            getAccountDescription(
              second.owner_name,
              second.provider_name,
              second.account_name,
            ),
          ),
      );

      const instrument =
        instrumentMap.get(instrumentId);

      const assetClass =
        instrument?.asset_class_id
          ? assetClassMap.get(
              instrument.asset_class_id,
            )
          : null;

      const estimatedValues =
        sortedPositions.map((position) =>
          getEstimatedPositionBaseValue(
            position,
            workspaceBaseCurrency,
          ),
        );

      const knownEstimatedValues =
        estimatedValues.filter(
          (value): value is number =>
            value !== null,
        );

      const valuationDates =
        sortedPositions
          .map(
            (position) =>
              position.valuation_date,
          )
          .filter(
            (value): value is string =>
              Boolean(value),
          )
          .sort();

      return {
        instrumentId,
        instrumentName:
          instrument?.name ??
          sortedPositions[0]
            ?.instrument_name ??
          "Unknown instrument",
        instrumentTicker:
          instrument?.ticker ??
          sortedPositions[0]
            ?.instrument_ticker ??
          null,
        assetClassId:
          assetClass?.id ?? null,
        assetClassName:
          assetClass?.name ??
          FALLBACK_ASSET_CLASS_NAME,
        assetClassCode:
          assetClass?.code ?? null,
        assetClassColor:
          assetClass?.color_hex ??
          FALLBACK_ASSET_CLASS_COLOR,
        assetClassSortOrder:
          assetClass?.sort_order ?? 999,
        positions: sortedPositions,
        totalQuantity:
          sortedPositions.reduce(
            (sum, position) =>
              sum +
              Number(
                position.quantity ?? 0,
              ),
            0,
          ),
        totalEstimatedBaseValue:
          knownEstimatedValues.length > 0
            ? knownEstimatedValues.reduce(
                (sum, value) =>
                  sum + value,
                0,
              )
            : null,
        valuedPositionCount:
          knownEstimatedValues.length,
        latestValuationDate:
          valuationDates.length > 0
            ? valuationDates[
                valuationDates.length - 1
              ]
            : null,
      } satisfies InstrumentPositionGroup;
    },
  );

  const classGroups = new Map<
    string,
    AssetClassPositionGroup
  >();

  for (const instrument of instrumentGroups) {
    const classKey =
      instrument.assetClassId ??
      `name:${instrument.assetClassName}`;

    const existing = classGroups.get(classKey);

    if (existing) {
      existing.instruments.push(instrument);
      continue;
    }

    classGroups.set(classKey, {
      assetClassId:
        instrument.assetClassId,
      assetClassName:
        instrument.assetClassName,
      assetClassCode:
        instrument.assetClassCode,
      assetClassColor:
        instrument.assetClassColor,
      assetClassSortOrder:
        instrument.assetClassSortOrder,
      instruments: [instrument],
    });
  }

  return Array.from(classGroups.values())
    .map((assetClass) => ({
      ...assetClass,
      instruments: [
        ...assetClass.instruments,
      ].sort((first, second) => {
        const firstValue =
          first.totalEstimatedBaseValue ??
          Number.NEGATIVE_INFINITY;

        const secondValue =
          second.totalEstimatedBaseValue ??
          Number.NEGATIVE_INFINITY;

        if (firstValue !== secondValue) {
          return secondValue - firstValue;
        }

        return (
          first.instrumentTicker ??
          first.instrumentName
        ).localeCompare(
          second.instrumentTicker ??
            second.instrumentName,
        );
      }),
    }))
    .sort((first, second) => {
      if (
        first.instruments.length !==
        second.instruments.length
      ) {
        return (
          second.instruments.length -
          first.instruments.length
        );
      }

      if (
        first.assetClassSortOrder !==
        second.assetClassSortOrder
      ) {
        return (
          first.assetClassSortOrder -
          second.assetClassSortOrder
        );
      }

      return first.assetClassName.localeCompare(
        second.assetClassName,
      );
    });
}

function sortCashBalances(
  balances: CashBalance[],
): CashBalance[] {
  return [...balances].sort((first, second) => {
    const firstAccount = getAccountDescription(
      first.owner_name,
      first.provider_name,
      first.account_name,
    );

    const secondAccount = getAccountDescription(
      second.owner_name,
      second.provider_name,
      second.account_name,
    );

    const accountComparison =
      firstAccount.localeCompare(secondAccount);

    if (accountComparison !== 0) {
      return accountComparison;
    }

    return (first.currency ?? "").localeCompare(
      second.currency ?? "",
    );
  });
}

function sortReportedBalances(
  balances: ReportedBalance[],
): ReportedBalance[] {
  return [...balances].sort((first, second) => {
    const firstAccount = getAccountDescription(
      first.owner_name,
      first.provider_name,
      first.account_name,
    );

    const secondAccount = getAccountDescription(
      second.owner_name,
      second.provider_name,
      second.account_name,
    );

    const accountComparison =
      firstAccount.localeCompare(secondAccount);

    if (accountComparison !== 0) {
      return accountComparison;
    }

    return (
      first.instrument_name ?? ""
    ).localeCompare(
      second.instrument_name ?? "",
    );
  });
}

export default async function PortfolioStatePage() {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", {
      ascending: true,
    })
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
    unitPositionsResult,
    cashBalancesResult,
    reportedBalancesResult,
    instrumentsResult,
    assetClassesResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, base_currency")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from(
        "portfolio_current_valued_unit_positions",
      )
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from(
        "portfolio_current_cash_balances",
      )
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from(
        "portfolio_current_reported_balances",
      )
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("instruments")
      .select(
        "id, name, ticker, asset_class_id",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("asset_classes")
      .select(
        "id, name, code, color_hex, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),
  ]);

  if (workspaceResult.error) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );
  }

  if (unitPositionsResult.error) {
    console.error(
      "Current valued unit positions query failed:",
      unitPositionsResult.error,
    );
  }

  if (cashBalancesResult.error) {
    console.error(
      "Current cash balances query failed:",
      cashBalancesResult.error,
    );
  }

  if (reportedBalancesResult.error) {
    console.error(
      "Current reported balances query failed:",
      reportedBalancesResult.error,
    );
  }

  if (instrumentsResult.error) {
    console.error(
      "Portfolio instruments query failed:",
      instrumentsResult.error,
    );
  }

  if (assetClassesResult.error) {
    console.error(
      "Portfolio asset classes query failed:",
      assetClassesResult.error,
    );
  }

  const {
    data: latestMonthlyReport,
    error: latestMonthlyReportError,
  } = await supabase
    .from("portfolio_report_runs")
    .select("id, as_of_date, revision")
    .eq(
      "workspace_id",
      membership.workspace_id,
    )
    .eq("report_type", "monthly")
    .neq("status", "voided")
    .order("as_of_date", {
      ascending: false,
    })
    .order("revision", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (latestMonthlyReportError) {
    console.error(
      "Latest monthly report query failed:",
      latestMonthlyReportError,
    );
  }

  let latestMonthlyReportItems:
    StateComparisonBaselineItem[] = [];

  if (latestMonthlyReport) {
    const {
      data,
      error,
    } = await supabase
      .from("portfolio_report_items")
      .select(
        "instrument_id, instrument_name, instrument_ticker, asset_class_name, asset_class_code, asset_class_color, asset_class_sort_order, quantity, market_value_base",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "report_run_id",
        latestMonthlyReport.id,
      );

    if (error) {
      console.error(
        "Latest monthly report item query failed:",
        error,
      );
    } else {
      latestMonthlyReportItems =
        (data ??
          []) as StateComparisonBaselineItem[];
    }
  }

  const workspace = workspaceResult.data;

  const workspaceBaseCurrency =
    workspace?.base_currency ?? "PLN";

  const unitPositions =
    unitPositionsResult.data ?? [];

  const cashBalances = sortCashBalances(
    cashBalancesResult.data ?? [],
  );

  const reportedBalances =
    sortReportedBalances(
      reportedBalancesResult.data ?? [],
    );

  const valuedUnitPositions =
    unitPositions.filter(
      (position) =>
        position.snapshot_id !== null,
    );

  const assetClassPositionGroups =
    buildAssetClassPositionGroups(
      unitPositions,
      instrumentsResult.data ?? [],
      assetClassesResult.data ?? [],
      workspaceBaseCurrency,
    );

  const instrumentPositionGroups =
    assetClassPositionGroups.flatMap(
      (assetClass) =>
        assetClass.instruments,
    );

  const snapshotComparisonItems =
    buildStateSnapshotComparison({
      current:
        instrumentPositionGroups.map(
          (instrument) => ({
            instrumentId:
              instrument.instrumentId,
            instrumentName:
              instrument.instrumentName,
            instrumentTicker:
              instrument.instrumentTicker,
            assetClassName:
              instrument.assetClassName,
            assetClassCode:
              instrument.assetClassCode,
            assetClassColor:
              instrument.assetClassColor,
            assetClassSortOrder:
              instrument.assetClassSortOrder,
            quantity:
              instrument.totalQuantity,
            estimatedBaseValue:
              instrument.totalEstimatedBaseValue,
          }),
        ),
      baseline:
        latestMonthlyReportItems,
    });

  const gpwSnapshotComparisonItems =
    snapshotComparisonItems.filter(
      (item) =>
        item.assetClassCode ===
        "polish_stocks",
    );

  const foreignSnapshotComparisonItems =
    snapshotComparisonItems.filter(
      (item) =>
        STATE_FOREIGN_ASSET_CLASS_CODES.includes(
          item.assetClassCode as
            (typeof STATE_FOREIGN_ASSET_CLASS_CODES)[number],
        ),
    );

  const latestMonthlyBaselineDate =
    latestMonthlyReport?.as_of_date ??
    null;

  const heldInstrumentCount =
    instrumentPositionGroups.length;

  const valuedInstrumentCount =
    instrumentPositionGroups.filter(
      (instrument) =>
        instrument.totalEstimatedBaseValue !==
        null,
    ).length;

  const negativeUnitPositions =
    unitPositions.filter(
      (position) =>
        Number(position.quantity ?? 0) < 0,
    );

  const negativeCashBalances =
    cashBalances.filter(
      (balance) =>
        Number(balance.cash_balance ?? 0) < 0,
    );

  const negativeReportedBalances =
    reportedBalances.filter(
      (balance) =>
        Number(
          balance.reported_balance ?? 0,
        ) < 0,
    );

  const valuationIssues =
    unitPositions.filter(
      (position) =>
        position.valuation_status ===
          "quantity_mismatch" ||
        position.valuation_status ===
          "missing_quantity",
    );

  const warningCount =
    negativeUnitPositions.length +
    negativeCashBalances.length +
    negativeReportedBalances.length +
    valuationIssues.length;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Portfolio Dashboard
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Calculated portfolio data
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Portfolio state
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/portfolio/operations"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              View operations
            </Link>

            <Link
              href="/portfolio/opening-state"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Add opening state
            </Link>

            <Link
              href="/portfolio/valuations"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Manage valuations
            </Link>

            <Link
              href="/portfolio/reports/monthly"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Prepare monthly report
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Held instruments
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {heldInstrumentCount}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {unitPositions.length} account positions
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Valued instruments
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {valuedInstrumentCount}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {valuedUnitPositions.length} account valuations
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Cash balances
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {cashBalances.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Reported balances
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {reportedBalances.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Warnings
            </p>

            <p
              className={
                warningCount > 0
                  ? "mt-2 text-3xl font-semibold text-amber-700"
                  : "mt-2 text-3xl font-semibold text-emerald-700"
              }
            >
              {warningCount}
            </p>
          </div>
        </section>

        <div className="mt-6 grid gap-6">
          <StateSnapshotComparisonChart
            title="GPW portfolio structure"
            description="Current Polish-stock holdings compared with the latest frozen monthly quantities."
            items={
              gpwSnapshotComparisonItems
            }
            baselineDate={
              latestMonthlyBaselineDate
            }
            baseCurrency={
              workspaceBaseCurrency
            }
          />

          <StateSnapshotComparisonChart
            title="Foreign-market assets"
            description="Current global ETFs, U.S. REITs and semiconductor holdings compared with the latest frozen monthly quantities."
            items={
              foreignSnapshotComparisonItems
            }
            baselineDate={
              latestMonthlyBaselineDate
            }
            baseCurrency={
              workspaceBaseCurrency
            }
            groupByAssetClass
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.8fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current instruments
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  One card per instrument. Account
                  positions are grouped underneath,
                  with totals estimated from the
                  latest available valuation data.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {heldInstrumentCount}
              </span>
            </div>

            {heldInstrumentCount > 0 ? (
              <div className="mt-7 space-y-9">
                {assetClassPositionGroups.map(
                  (assetClass) => (
                    <section
                      key={
                        assetClass.assetClassId ??
                        assetClass.assetClassName
                      }
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3.5 w-3.5 rounded-full"
                            style={{
                              backgroundColor:
                                assetClass.assetClassColor,
                            }}
                            aria-hidden="true"
                          />

                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {
                                assetClass.assetClassName
                              }
                            </h3>

                            {assetClass.assetClassCode && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {
                                  assetClass.assetClassCode
                                }
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {
                            assetClass.instruments
                              .length
                          }{" "}
                          {assetClass.instruments
                            .length === 1
                            ? "instrument"
                            : "instruments"}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {assetClass.instruments.map(
                          (instrument) => (
                            <article
                              key={
                                instrument.instrumentId
                              }
                              className="rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm"
                              style={{
                                borderLeftColor:
                                  instrument.assetClassColor,
                              }}
                            >
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-lg font-semibold text-slate-900">
                                      {instrument.instrumentTicker ??
                                        instrument.instrumentName}
                                    </p>

                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{
                                        backgroundColor:
                                          instrument.assetClassColor,
                                      }}
                                      aria-hidden="true"
                                    />
                                  </div>

                                  {instrument.instrumentTicker && (
                                    <p className="mt-1 text-sm text-slate-600">
                                      {
                                        instrument.instrumentName
                                      }
                                    </p>
                                  )}

                                  <p className="mt-2 text-xs text-slate-500">
                                    {
                                      instrument.assetClassName
                                    }{" "}
                                    · {instrument.positions.length}{" "}
                                    {instrument.positions.length ===
                                    1
                                      ? "account"
                                      : "accounts"}
                                    {instrument.latestValuationDate
                                      ? ` · latest pricing ${instrument.latestValuationDate}`
                                      : ""}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                  <div className="rounded-xl bg-blue-50 px-4 py-2 text-right">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-600">
                                      Total units
                                    </p>

                                    <p className="mt-1 text-lg font-semibold text-blue-800">
                                      {formatQuantity(
                                        instrument.totalQuantity,
                                      )}
                                    </p>
                                  </div>

                                  <div className="rounded-xl bg-slate-100 px-4 py-2 text-right">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                      Estimated value
                                    </p>

                                    <p className="mt-1 text-lg font-semibold text-slate-900">
                                      {instrument.totalEstimatedBaseValue ===
                                      null
                                        ? "—"
                                        : `${formatAmount(
                                            instrument.totalEstimatedBaseValue,
                                          )} ${workspaceBaseCurrency}`}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {instrument.valuedPositionCount <
                                instrument.positions.length && (
                                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  Aggregate value uses{" "}
                                  {
                                    instrument.valuedPositionCount
                                  }{" "}
                                  of{" "}
                                  {instrument.positions.length}{" "}
                                  account valuations.
                                </p>
                              )}

                              <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                                {instrument.positions.map(
                                  (position) => {
                                    const quantity = Number(
                                      position.quantity ?? 0,
                                    );

                                    const estimatedBaseValue =
                                      getEstimatedPositionBaseValue(
                                        position,
                                        workspaceBaseCurrency,
                                      );

                                    const valuationQuantity =
                                      position.valuation_quantity ===
                                      null
                                        ? null
                                        : Number(
                                            position.valuation_quantity,
                                          );

                                    const valuationUnitPrice =
                                      position.valuation_unit_price ===
                                      null
                                        ? null
                                        : Number(
                                            position.valuation_unit_price,
                                          );

                                    const valuationMatched =
                                      position.valuation_status ===
                                      "matched";

                                    const hasValuation =
                                      position.snapshot_id !==
                                      null;

                                    return (
                                      <div
                                        key={`${position.account_id}-${position.instrument_id}`}
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                                      >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                          <div>
                                            <p className="font-medium text-slate-900">
                                              {getAccountDescription(
                                                position.owner_name,
                                                position.provider_name,
                                                position.account_name,
                                              )}
                                            </p>

                                            <p className="mt-1 text-xs text-slate-500">
                                              Activity:{" "}
                                              {position.first_activity_date ??
                                                "—"}{" "}
                                              →{" "}
                                              {position.last_activity_date ??
                                                "—"}
                                            </p>
                                          </div>

                                          <div className="flex flex-wrap gap-2 sm:justify-end">
                                            <span
                                              className={
                                                quantity >= 0
                                                  ? "w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                                                  : "w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                                              }
                                            >
                                              {quantity >= 0
                                                ? "+"
                                                : ""}
                                              {formatQuantity(
                                                quantity,
                                              )}
                                            </span>

                                            {estimatedBaseValue !==
                                              null && (
                                              <span className="w-fit rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                                                {formatAmount(
                                                  estimatedBaseValue,
                                                )}{" "}
                                                {
                                                  workspaceBaseCurrency
                                                }
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {hasValuation ? (
                                          <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                                            <p>
                                              Valuation date:{" "}
                                              {position.valuation_date ??
                                                "—"}
                                            </p>

                                            <p>
                                              Snapshot quantity:{" "}
                                              {valuationQuantity ===
                                              null
                                                ? "—"
                                                : formatQuantity(
                                                    valuationQuantity,
                                                  )}
                                            </p>

                                            <p>
                                              Unit price:{" "}
                                              {valuationUnitPrice ===
                                              null
                                                ? "—"
                                                : `${formatAmount(
                                                    valuationUnitPrice,
                                                  )} ${
                                                    position.valuation_currency ??
                                                    ""
                                                  }`}
                                            </p>

                                            <p>
                                              Source:{" "}
                                              {position.valuation_source ??
                                                "—"}
                                            </p>

                                            <div className="sm:col-span-2">
                                              <span
                                                className={
                                                  valuationMatched
                                                    ? "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                                    : "inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                                                }
                                              >
                                                {valuationMatched
                                                  ? "Quantity matched"
                                                  : "Quantity mismatch"}
                                              </span>
                                            </div>

                                            {position.valuation_notes && (
                                              <p className="sm:col-span-2 leading-5">
                                                {
                                                  position.valuation_notes
                                                }
                                              </p>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
                                            No valuation yet.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </article>
                          ),
                        )}
                      </div>
                    </section>
                  ),
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No unit positions
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add opening positions or trade
                  operations to calculate holdings.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current cash balances
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Cash calculated from all posted
                  ledger entries.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {cashBalances.length}
              </span>
            </div>

            {cashBalances.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {cashBalances.map((balance) => {
                  const cashBalance = Number(
                    balance.cash_balance ?? 0,
                  );

                  return (
                    <li
                      key={`${balance.account_id}-${balance.currency}`}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {getAccountDescription(
                              balance.owner_name,
                              balance.provider_name,
                              balance.account_name,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Account currency:{" "}
                            {
                              balance.account_currency
                            }
                          </p>
                        </div>

                        <span
                          className={
                            cashBalance >= 0
                              ? "w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
                              : "w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                          }
                        >
                          {cashBalance >= 0
                            ? "+"
                            : ""}
                          {formatAmount(
                            cashBalance,
                          )}{" "}
                          {balance.currency}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        Activity:{" "}
                        {balance.first_activity_date ??
                          "—"}{" "}
                        →{" "}
                        {balance.last_activity_date ??
                          "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No cash balances
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add opening cash balances or cash
                  operations.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Current reported balances
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Latest dated snapshots for assets
                tracked as reported values, such as
                PPK.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {reportedBalances.length}
            </span>
          </div>

          {reportedBalances.length > 0 ? (
            <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reportedBalances.map((balance) => {
                const reportedBalance = Number(
                  balance.reported_balance ?? 0,
                );

                return (
                  <li
                    key={`${balance.account_id}-${balance.instrument_id}`}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <p className="font-medium">
                      {balance.instrument_ticker ||
                        balance.instrument_name}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      {balance.instrument_name}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      {getAccountDescription(
                        balance.owner_name,
                        balance.provider_name,
                        balance.account_name,
                      )}
                    </p>

                    <p
                      className={
                        reportedBalance >= 0
                          ? "mt-4 text-xl font-semibold text-violet-700"
                          : "mt-4 text-xl font-semibold text-amber-700"
                      }
                    >
                      {formatAmount(
                        reportedBalance,
                      )}{" "}
                      {balance.currency}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      Latest snapshot:{" "}
                      {balance.last_activity_date ??
                        "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <p className="font-medium">
                No reported balances
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                This section will contain PPK and
                other assets tracked through dated
                reported values.
              </p>
            </div>
          )}
        </section>

        {warningCount > 0 ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Incomplete or inconsistent state
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              Negative balances usually mean that
              an opening balance or an earlier
              operation is missing. A valuation
              mismatch means that the latest
              snapshot quantity differs from the
              current ledger quantity.
            </p>

            <div className="mt-4 space-y-2">
              {negativeUnitPositions.map(
                (position) => (
                  <p
                    key={`negative-units-${position.account_id}-${position.instrument_id}`}
                    className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900"
                  >
                    Negative units:{" "}
                    {getAccountDescription(
                      position.owner_name,
                      position.provider_name,
                      position.account_name,
                    )}{" "}
                    ·{" "}
                    {position.instrument_ticker ||
                      position.instrument_name}{" "}
                    ·{" "}
                    {formatQuantity(
                      Number(
                        position.quantity ?? 0,
                      ),
                    )}
                  </p>
                ),
              )}

              {negativeCashBalances.map(
                (balance) => (
                  <p
                    key={`negative-cash-${balance.account_id}-${balance.currency}`}
                    className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900"
                  >
                    Negative cash:{" "}
                    {getAccountDescription(
                      balance.owner_name,
                      balance.provider_name,
                      balance.account_name,
                    )}{" "}
                    ·{" "}
                    {formatAmount(
                      Number(
                        balance.cash_balance ??
                          0,
                      ),
                    )}{" "}
                    {balance.currency}
                  </p>
                ),
              )}

              {negativeReportedBalances.map(
                (balance) => (
                  <p
                    key={`negative-reported-${balance.account_id}-${balance.instrument_id}`}
                    className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900"
                  >
                    Negative reported balance:{" "}
                    {getAccountDescription(
                      balance.owner_name,
                      balance.provider_name,
                      balance.account_name,
                    )}{" "}
                    ·{" "}
                    {balance.instrument_name} ·{" "}
                    {formatAmount(
                      Number(
                        balance.reported_balance ??
                          0,
                      ),
                    )}{" "}
                    {balance.currency}
                  </p>
                ),
              )}

              {valuationIssues.map(
                (position) => {
                  const currentQuantity =
                    Number(
                      position.quantity ?? 0,
                    );

                  const snapshotQuantity =
                    position.valuation_quantity ===
                    null
                      ? null
                      : Number(
                          position.valuation_quantity,
                        );

                  return (
                    <p
                      key={`valuation-${position.account_id}-${position.instrument_id}`}
                      className="rounded-lg bg-white/70 px-4 py-3 text-sm text-amber-900"
                    >
                      Valuation quantity issue:{" "}
                      {getAccountDescription(
                        position.owner_name,
                        position.provider_name,
                        position.account_name,
                      )}{" "}
                      ·{" "}
                      {position.instrument_ticker ||
                        position.instrument_name}{" "}
                      · ledger{" "}
                      {formatQuantity(
                        currentQuantity,
                      )}
                      {" · snapshot "}
                      {snapshotQuantity === null
                        ? "missing"
                        : formatQuantity(
                            snapshotQuantity,
                          )}
                    </p>
                  );
                },
              )}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-lg font-semibold text-emerald-900">
              No consistency warnings
            </h2>

            <p className="mt-2 text-sm leading-6 text-emerald-800">
              All calculated balances are
              non-negative and valuation quantities
              match their current ledger positions.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}