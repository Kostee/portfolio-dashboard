import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  getDateInTimeZone,
  isValidIsoDate,
} from "../../operations/form-helpers";
import {
  confirmMonthlyReportedSnapshot,
  confirmMonthlyUnitSnapshot,
  createMonthlyReportSnapshot,
  saveMonthlyReportedSnapshot,
  saveMonthlyUnitSnapshot,
} from "./actions";

type MonthlyReportPageProps = {
  searchParams: Promise<{
    asOf?: string;
    error?: string;
    success?: string;
    reportRunId?: string;
  }>;
};

type Account = Pick<
  Database["public"]["Tables"]["accounts"]["Row"],
  | "id"
  | "owner_id"
  | "provider_id"
  | "name"
  | "base_currency"
  | "account_type"
>;

type UnitPosition =
  Database["public"]["Functions"]["get_portfolio_unit_positions_as_of"]["Returns"][number];

type ReportedBalance =
  Database["public"]["Functions"]["get_portfolio_reported_balances_as_of"]["Returns"][number];

type ReportRun = Pick<
  Database["public"]["Tables"]["portfolio_report_runs"]["Row"],
  | "id"
  | "as_of_date"
  | "revision"
  | "status"
  | "base_currency"
  | "item_count"
  | "total_value_base"
  | "prepared_at"
  | "generated_at"
>;

type ReportItem = Pick<
  Database["public"]["Tables"]["portfolio_report_items"]["Row"],
  | "id"
  | "item_type"
  | "owner_name"
  | "provider_name"
  | "account_name"
  | "instrument_name"
  | "instrument_ticker"
  | "asset_class_name"
  | "quantity"
  | "market_value"
  | "currency"
  | "market_value_base"
  | "source_snapshot_date"
>;

const ERROR_MESSAGES: Record<
  string,
  string
> = {
  workspace_not_found:
    "The portfolio workspace is unavailable.",
  forbidden:
    "You cannot prepare reports in this workspace.",
  date_invalid:
    "Enter a valid report date.",
  account_required:
    "Select an account.",
  instrument_required:
    "Select an instrument.",
  quantity_invalid:
    "The ledger quantity is invalid.",
  unit_value_invalid:
    "Enter a valid position value.",
  reported_value_invalid:
    "Enter a valid reported balance.",
  currency_invalid:
    "Select a supported currency.",
  currency_mismatch:
    "The valuation currency must match the instrument currency.",
  base_value_invalid:
    "Enter a valid PLN value.",
  base_value_required:
    "A PLN equivalent is required for a foreign-currency position.",
  invalid_account:
    "The selected account is unavailable.",
  invalid_instrument:
    "The selected instrument is unavailable.",
  invalid_units_instrument:
    "The selected instrument is not tracked using units.",
  invalid_balance_instrument:
    "The selected instrument is not tracked as a reported balance.",
  valuation_missing:
    "There is no previous valuation to confirm.",
  quantity_mismatch:
    "The previous snapshot quantity does not match the ledger quantity. Enter a new valuation.",
  snapshot_failed:
    "The valuation snapshot could not be saved.",
  review_failed:
    "The report readiness check failed.",
  report_not_ready:
    "Complete or confirm every required valuation before continuing.",
  report_snapshot_failed:
    "The immutable monthly report snapshot could not be created.",
};

const SUCCESS_MESSAGES: Record<
  string,
  string
> = {
  unit_saved:
    "The position valuation was saved.",
  unit_confirmed:
    "The previous position value was confirmed for the selected date.",
  reported_saved:
    "The reported balance was saved.",
  reported_confirmed:
    "The previous reported balance was confirmed for the selected date.",
  review_complete:
    "All required portfolio values are confirmed for this report date.",
  report_snapshot_created:
    "The immutable monthly report snapshot was created.",
};

function formatQuantity(
  value: number,
): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatAmount(
  value: number,
): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatDateTime(
  value: string | null,
  timeZone: string,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function buildReportRunHref(
  asOfDate: string,
  reportRunId: string,
): string {
  const searchParams =
    new URLSearchParams({
      asOf: asOfDate,
      reportRunId,
    });

  return `/portfolio/reports/monthly?${searchParams.toString()}`;
}

function getSecondSaturday(
  dateValue: string,
): string {
  const [
    yearString,
    monthString,
  ] = dateValue.split("-");

  const year = Number(yearString);
  const monthIndex =
    Number(monthString) - 1;

  const firstDayOfMonth =
    new Date(
      Date.UTC(
        year,
        monthIndex,
        1,
      ),
    ).getUTCDay();

  const daysUntilFirstSaturday =
    (6 - firstDayOfMonth + 7) % 7;

  const secondSaturdayDay =
    1 +
    daysUntilFirstSaturday +
    7;

  return [
    String(year).padStart(4, "0"),
    String(monthIndex + 1).padStart(
      2,
      "0",
    ),
    String(secondSaturdayDay).padStart(
      2,
      "0",
    ),
  ].join("-");
}

function getAccountDescription(
  account: Account,
  ownerName: string | null,
  providerName: string | null,
): string {
  return [
    ownerName,
    providerName,
    account.name,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function MonthlyReportPage({
  searchParams,
}: MonthlyReportPageProps) {
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
    .select("workspace_id, role")
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

  const {
    data: workspace,
    error: workspaceError,
  } = await supabase
    .from("workspaces")
    .select(
      "name, timezone, base_currency",
    )
    .eq("id", membership.workspace_id)
    .single();

  if (workspaceError || !workspace) {
    console.error(
      "Workspace query failed:",
      workspaceError,
    );

    redirect("/portfolio");
  }

  const {
    asOf: requestedAsOfDate,
    error: errorCode,
    success: successCode,
    reportRunId:
      selectedReportRunId,
  } = await searchParams;

  const today = getDateInTimeZone(
    workspace.timezone,
  );

  const defaultReportDate =
    getSecondSaturday(today);

  const asOfDate =
    requestedAsOfDate &&
    isValidIsoDate(requestedAsOfDate)
      ? requestedAsOfDate
      : defaultReportDate;

  const [
    ownersResult,
    providersResult,
    accountsResult,
    instrumentsResult,
    assetClassesResult,
    unitPositionsResult,
    reportedBalancesResult,
    reportHistoryResult,
  ] = await Promise.all([
    supabase
      .from("owners")
      .select(
        "id, display_name, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

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
        "id, owner_id, provider_id, name, base_currency, account_type",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),

    supabase
      .from("instruments")
      .select(
        "id, name, ticker, asset_class_id, instrument_kind, tracking_mode, default_currency",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),

    supabase
      .from("asset_classes")
      .select(
        "id, name, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase.rpc(
      "get_portfolio_unit_positions_as_of",
      {
        p_workspace_id:
          membership.workspace_id,
        p_as_of_date: asOfDate,
      },
    ),

    supabase.rpc(
      "get_portfolio_reported_balances_as_of",
      {
        p_workspace_id:
          membership.workspace_id,
        p_as_of_date: asOfDate,
      },
    ),

    supabase
      .from(
          "portfolio_monthly_report_history",
      )
      .select(
        "report_run_id, as_of_date, revision, status, base_currency, item_count, total_value_base, prepared_at, generated_at",
      )
      .eq(
          "workspace_id",
          membership.workspace_id,
      )
      .order("as_of_date", {
          ascending: false,
      })
      .order("revision", {
          ascending: false,
      })
      .limit(20),
    ]);

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

  if (assetClassesResult.error) {
    console.error(
      "Asset classes query failed:",
      assetClassesResult.error,
    );
  }

  if (unitPositionsResult.error) {
    console.error(
      "As-of unit positions query failed:",
      unitPositionsResult.error,
    );
  }

  if (reportedBalancesResult.error) {
    console.error(
      "As-of reported balances query failed:",
      reportedBalancesResult.error,
    );
  }

  if (reportHistoryResult.error) {
    console.error(
      "Monthly report history query failed:",
      reportHistoryResult.error,
    );
  }

  const owners =
    ownersResult.data ?? [];

  const providers =
    providersResult.data ?? [];

  const accounts =
    accountsResult.data ?? [];

  const instruments =
    instrumentsResult.data ?? [];

  const assetClasses =
    assetClassesResult.data ?? [];

  const unitPositions =
    (unitPositionsResult.data ??
      []) as UnitPosition[];

  const reportedBalances =
    (reportedBalancesResult.data ??
      []) as ReportedBalance[];

  const reportHistory =
    reportHistoryResult.data ?? [];

  let selectedReport:
    ReportRun | null = null;

  let selectedReportItems:
    ReportItem[] = [];

  if (selectedReportRunId) {
    const [
      selectedReportResult,
      selectedItemsResult,
    ] = await Promise.all([
      supabase
        .from("portfolio_report_runs")
        .select(
          "id, as_of_date, revision, status, base_currency, item_count, total_value_base, prepared_at, generated_at",
        )
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq(
          "id",
          selectedReportRunId,
        )
        .maybeSingle(),

      supabase
        .from("portfolio_report_items")
        .select(
          "id, item_type, owner_name, provider_name, account_name, instrument_name, instrument_ticker, asset_class_name, quantity, market_value, currency, market_value_base, source_snapshot_date",
        )
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq(
          "report_run_id",
          selectedReportRunId,
        )
        .order(
          "asset_class_sort_order",
          {
            ascending: true,
          },
        )
        .order("instrument_name", {
          ascending: true,
        }),
    ]);

    if (selectedReportResult.error) {
      console.error(
        "Selected monthly report query failed:",
        selectedReportResult.error,
      );
    }

    if (selectedItemsResult.error) {
      console.error(
        "Selected monthly report items query failed:",
        selectedItemsResult.error,
      );
    }

    selectedReport =
      selectedReportResult.data;

    selectedReportItems =
      selectedItemsResult.data ?? [];
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

  const assetClassMap = new Map(
    assetClasses.map((assetClass) => [
      assetClass.id,
      assetClass,
    ]),
  );

  const sortedUnitPositions =
    [...unitPositions].sort(
      (first, second) => {
        const firstInstrument =
          first.instrument_id
            ? instrumentMap.get(
                first.instrument_id,
              )
            : undefined;

        const secondInstrument =
          second.instrument_id
            ? instrumentMap.get(
                second.instrument_id,
              )
            : undefined;

        const firstAssetClass =
          firstInstrument?.asset_class_id
            ? assetClassMap.get(
                firstInstrument
                  .asset_class_id,
              )
            : undefined;

        const secondAssetClass =
          secondInstrument?.asset_class_id
            ? assetClassMap.get(
                secondInstrument
                  .asset_class_id,
              )
            : undefined;

        const classDifference =
          (firstAssetClass?.sort_order ??
            999) -
          (secondAssetClass?.sort_order ??
            999);

        if (classDifference !== 0) {
          return classDifference;
        }

        return (
          first.instrument_ticker ??
          first.instrument_name ??
          ""
        ).localeCompare(
          second.instrument_ticker ??
            second.instrument_name ??
            "",
        );
      },
    );

  const ppkAccounts = accounts
    .filter(
      (account) =>
        account.account_type === "ppk",
    )
    .sort((first, second) => {
      const firstOwner =
        ownerMap.get(first.owner_id);

      const secondOwner =
        ownerMap.get(second.owner_id);

      return (
        (firstOwner?.sort_order ?? 999) -
        (secondOwner?.sort_order ?? 999)
      );
    });

  const ppkInstruments =
    instruments.filter(
      (instrument) =>
        instrument.tracking_mode ===
          "balance" &&
        instrument.instrument_kind ===
          "ppk_fund",
    );

  const reportedTargets =
    ppkAccounts.flatMap((account) =>
      ppkInstruments.map(
        (instrument) => ({
          account,
          instrument,
          balance:
            reportedBalances.find(
              (balance) =>
                balance.account_id ===
                  account.id &&
                balance.instrument_id ===
                  instrument.id,
            ) ?? null,
        }),
      ),
    );

  const workspaceBaseCurrency =
    workspace.base_currency;

  const unitReadiness =
    sortedUnitPositions.map(
      (position) => {
        const baseValueReady =
          position.valuation_currency ===
            workspaceBaseCurrency ||
          position
            .valuation_market_value_base !==
            null;

        const ready =
          position.valuation_date ===
            asOfDate &&
          position.valuation_status ===
            "matched" &&
          position.valuation_market_value !==
            null &&
          baseValueReady;

        return {
          position,
          ready,
        };
      },
    );

  const reportedReadiness =
    reportedTargets.map((target) => {
      const balance = target.balance;

      const baseValueReady =
        balance !== null &&
        (
          balance.currency ===
            workspaceBaseCurrency ||
          balance.base_reported_balance !==
            null
        );

      const ready =
        balance !== null &&
        balance.snapshot_date ===
          asOfDate &&
        balance.reported_balance !==
          null &&
        baseValueReady;

      return {
        ...target,
        ready,
      };
    });

  const readyCount =
    unitReadiness.filter(
      (item) => item.ready,
    ).length +
    reportedReadiness.filter(
      (item) => item.ready,
    ).length;

  const requiredCount =
    unitReadiness.length +
    reportedReadiness.length;

  const missingCount =
    requiredCount - readyCount;

  const reportReady =
    requiredCount > 0 &&
    missingCount === 0;

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ??
      "The monthly report preparation failed."
    : null;

  const successMessage = successCode
    ? SUCCESS_MESSAGES[successCode] ??
      null
    : null;

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/state"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Portfolio state
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Monthly reporting
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Prepare monthly report
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace: {workspace.name}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-xl font-semibold">
                Report date
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                The default is the second Saturday
                of the current month. Any historical
                or current date may be selected.
              </p>
            </div>

            <form
              method="get"
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div>
                <label
                  htmlFor="asOf"
                  className="block text-sm font-medium text-slate-700"
                >
                  As-of date
                </label>

                <input
                  id="asOf"
                  name="asOf"
                  type="date"
                  required
                  defaultValue={asOfDate}
                  className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Load date
              </button>
            </form>
          </div>
        </section>

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
          Cash balances are intentionally excluded
          from monthly report readiness and from all
          five portfolio charts. Only invested
          assets and reported balances are included.
        </div>

        {successMessage && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="mt-6 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Required items
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {requiredCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Ready
            </p>

            <p className="mt-2 text-3xl font-semibold text-emerald-700">
              {readyCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Needs attention
            </p>

            <p
              className={
                missingCount > 0
                  ? "mt-2 text-3xl font-semibold text-amber-700"
                  : "mt-2 text-3xl font-semibold text-emerald-700"
              }
            >
              {missingCount}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Units-based positions
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Confirm the ledger quantity and
                store the position value observed on{" "}
                {asOfDate}.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {unitReadiness.length}
            </span>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {unitReadiness.map(
              ({ position, ready }) => {
                const account =
                  position.account_id
                    ? accountMap.get(
                        position.account_id,
                      )
                    : undefined;

                const instrument =
                  position.instrument_id
                    ? instrumentMap.get(
                        position.instrument_id,
                      )
                    : undefined;

                if (
                  !account ||
                  !instrument ||
                  !position.account_id ||
                  !position.instrument_id
                ) {
                  return null;
                }

                const owner =
                  ownerMap.get(
                    account.owner_id,
                  );

                const provider =
                  providerMap.get(
                    account.provider_id,
                  );

                const assetClass =
                  instrument.asset_class_id
                    ? assetClassMap.get(
                        instrument
                          .asset_class_id,
                      )
                    : undefined;

                const quantity = Number(
                  position.quantity ?? 0,
                );

                const currency =
                  position
                    .instrument_currency ??
                  instrument.default_currency ??
                  workspaceBaseCurrency;

                const hasPreviousValuation =
                  position.snapshot_id !==
                    null &&
                  position
                    .valuation_market_value !==
                    null;

                const baseValueReady =
                  currency ===
                    workspaceBaseCurrency ||
                  position
                    .valuation_market_value_base !==
                    null;

                const canConfirmPrevious =
                  !ready &&
                  hasPreviousValuation &&
                  position.valuation_status ===
                    "matched" &&
                  baseValueReady;

                return (
                  <article
                    key={`${position.account_id}-${position.instrument_id}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold">
                          {position.instrument_ticker ||
                            position.instrument_name}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          {
                            position.instrument_name
                          }
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          {getAccountDescription(
                            account,
                            owner?.display_name ??
                              null,
                            provider?.name ?? null,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {assetClass?.name ??
                            "Unclassified asset"}
                        </p>
                      </div>

                      <span
                        className={
                          ready
                            ? "w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
                            : "w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                        }
                      >
                        {ready
                          ? "Ready"
                          : "Needs confirmation"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-slate-500">
                          Ledger quantity
                        </p>

                        <p className="mt-1 text-lg font-semibold">
                          {formatQuantity(
                            quantity,
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-slate-500">
                          Latest valuation
                        </p>

                        <p className="mt-1 text-lg font-semibold">
                          {hasPreviousValuation
                            ? `${formatAmount(
                                Number(
                                  position
                                    .valuation_market_value,
                                ),
                              )} ${position.valuation_currency}`
                            : "None"}
                        </p>

                        {position.valuation_date && (
                          <p className="mt-1 text-xs text-slate-500">
                            {
                              position.valuation_date
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    {ready ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="font-medium text-emerald-800">
                          Confirmed for {asOfDate}
                        </p>

                        <p className="mt-1 text-sm text-emerald-700">
                          {formatAmount(
                            Number(
                              position
                                .valuation_market_value,
                            ),
                          )}{" "}
                          {
                            position.valuation_currency
                          }

                          {position
                            .valuation_market_value_base !==
                            null &&
                            position.valuation_currency !==
                              workspaceBaseCurrency &&
                            ` · ${formatAmount(
                              Number(
                                position
                                  .valuation_market_value_base,
                              ),
                            )} ${workspaceBaseCurrency}`}
                        </p>
                      </div>
                    ) : (
                      <>
                        {canConfirmPrevious && (
                          <form
                            action={
                              confirmMonthlyUnitSnapshot
                            }
                            className="mt-4"
                          >
                            <input
                              type="hidden"
                              name="asOfDate"
                              value={asOfDate}
                            />

                            <input
                              type="hidden"
                              name="accountId"
                              value={
                                position.account_id
                              }
                            />

                            <input
                              type="hidden"
                              name="instrumentId"
                              value={
                                position.instrument_id
                              }
                            />

                            <button
                              type="submit"
                              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              Confirm previous value unchanged
                            </button>
                          </form>
                        )}

                        {canEdit && (
                          <form
                            action={
                              saveMonthlyUnitSnapshot
                            }
                            className="mt-4 space-y-4 rounded-xl bg-white p-4"
                          >
                            <input
                              type="hidden"
                              name="asOfDate"
                              value={asOfDate}
                            />

                            <input
                              type="hidden"
                              name="accountId"
                              value={
                                position.account_id
                              }
                            />

                            <input
                              type="hidden"
                              name="instrumentId"
                              value={
                                position.instrument_id
                              }
                            />

                            <input
                              type="hidden"
                              name="quantity"
                              value={quantity}
                            />

                            <input
                              type="hidden"
                              name="currency"
                              value={currency}
                            />

                            <div>
                              <label className="block text-sm font-medium text-slate-700">
                                Total value in{" "}
                                {currency}
                              </label>

                              <input
                                name="marketValue"
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                defaultValue={
                                  position
                                    .valuation_market_value ??
                                  ""
                                }
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              />
                            </div>

                            {currency !==
                              workspaceBaseCurrency && (
                              <div>
                                <label className="block text-sm font-medium text-slate-700">
                                  Total value in{" "}
                                  {
                                    workspaceBaseCurrency
                                  }
                                </label>

                                <input
                                  name="marketValueBase"
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  defaultValue={
                                    position
                                      .valuation_market_value_base ??
                                    ""
                                  }
                                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                />
                              </div>
                            )}

                            <div>
                              <label className="block text-sm font-medium text-slate-700">
                                Notes
                                <span className="ml-1 font-normal text-slate-500">
                                  (optional)
                                </span>
                              </label>

                              <input
                                name="notes"
                                type="text"
                                maxLength={500}
                                placeholder="Monthly report valuation"
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                              Save valuation for{" "}
                              {asOfDate}
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Reported balances
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Confirm the full reported value of
                each PPK account.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {reportedReadiness.length}
            </span>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {reportedReadiness.map(
              ({
                account,
                instrument,
                balance,
                ready,
              }) => {
                const owner =
                  ownerMap.get(
                    account.owner_id,
                  );

                const provider =
                  providerMap.get(
                    account.provider_id,
                  );

                const currency =
                  balance?.currency ??
                  instrument.default_currency ??
                  workspaceBaseCurrency;

                const hasPreviousValue =
                  balance !== null &&
                  balance.reported_balance !==
                    null;

                const canConfirmPrevious =
                  !ready &&
                  hasPreviousValue &&
                  (
                    currency ===
                      workspaceBaseCurrency ||
                    balance
                      .base_reported_balance !==
                      null
                  );

                return (
                  <article
                    key={`${account.id}-${instrument.id}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold">
                          {instrument.name}
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          {getAccountDescription(
                            account,
                            owner?.display_name ??
                              null,
                            provider?.name ?? null,
                          )}
                        </p>
                      </div>

                      <span
                        className={
                          ready
                            ? "w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
                            : "w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                        }
                      >
                        {ready
                          ? "Ready"
                          : "Needs confirmation"}
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl bg-white p-4">
                      <p className="text-xs text-slate-500">
                        Latest reported value
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {hasPreviousValue
                          ? `${formatAmount(
                              Number(
                                balance
                                  ?.reported_balance,
                              ),
                            )} ${currency}`
                          : "None"}
                      </p>

                      {balance?.snapshot_date && (
                        <p className="mt-1 text-xs text-slate-500">
                          {balance.snapshot_date}
                        </p>
                      )}
                    </div>

                    {ready ? (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="font-medium text-emerald-800">
                          Confirmed for {asOfDate}
                        </p>

                        <p className="mt-1 text-sm text-emerald-700">
                          {formatAmount(
                            Number(
                              balance
                                ?.reported_balance,
                            ),
                          )}{" "}
                          {currency}
                        </p>
                      </div>
                    ) : (
                      <>
                        {canConfirmPrevious && (
                          <form
                            action={
                              confirmMonthlyReportedSnapshot
                            }
                            className="mt-4"
                          >
                            <input
                              type="hidden"
                              name="asOfDate"
                              value={asOfDate}
                            />

                            <input
                              type="hidden"
                              name="accountId"
                              value={account.id}
                            />

                            <input
                              type="hidden"
                              name="instrumentId"
                              value={
                                instrument.id
                              }
                            />

                            <button
                              type="submit"
                              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              Confirm previous value unchanged
                            </button>
                          </form>
                        )}

                        {canEdit && (
                          <form
                            action={
                              saveMonthlyReportedSnapshot
                            }
                            className="mt-4 space-y-4 rounded-xl bg-white p-4"
                          >
                            <input
                              type="hidden"
                              name="asOfDate"
                              value={asOfDate}
                            />

                            <input
                              type="hidden"
                              name="accountId"
                              value={account.id}
                            />

                            <input
                              type="hidden"
                              name="instrumentId"
                              value={
                                instrument.id
                              }
                            />

                            <input
                              type="hidden"
                              name="currency"
                              value={currency}
                            />

                            <div>
                              <label className="block text-sm font-medium text-slate-700">
                                Reported value in{" "}
                                {currency}
                              </label>

                              <input
                                name="marketValue"
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                defaultValue={
                                  balance
                                    ?.reported_balance ??
                                  ""
                                }
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              />
                            </div>

                            {currency !==
                              workspaceBaseCurrency && (
                              <div>
                                <label className="block text-sm font-medium text-slate-700">
                                  Value in{" "}
                                  {
                                    workspaceBaseCurrency
                                  }
                                </label>

                                <input
                                  name="marketValueBase"
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  defaultValue={
                                    balance
                                      ?.base_reported_balance ??
                                    ""
                                  }
                                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                />
                              </div>
                            )}

                            <div>
                              <label className="block text-sm font-medium text-slate-700">
                                Notes
                                <span className="ml-1 font-normal text-slate-500">
                                  (optional)
                                </span>
                              </label>

                              <input
                                name="notes"
                                type="text"
                                maxLength={500}
                                placeholder="Monthly mojeppk.pl reading"
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                              Save reported balance
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </article>
                );
              },
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                <h2 className="text-xl font-semibold">
                    Create immutable report source
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                    All invested positions and PPK balances
                    must have an exact snapshot for{" "}
                    {asOfDate}. Cash is not included.
                </p>
                </div>

                <form
                action={
                    createMonthlyReportSnapshot
                }
                >
                <input
                    type="hidden"
                    name="asOfDate"
                    value={asOfDate}
                />

                <button
                    type="submit"
                    disabled={!reportReady}
                    className={
                    reportReady
                        ? "rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                        : "cursor-not-allowed rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-medium text-slate-500"
                    }
                >
                    {reportReady
                    ? "Create report snapshot"
                    : `Complete ${missingCount} items`}
                </button>
                </form>
            </div>

            {reportReady && (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                Creating another snapshot for the same
                report date will create a new revision.
                Earlier revisions remain unchanged.
                </div>
            )}
            </section>

            {selectedReport && (
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-700">
                    Frozen monthly report source
                    </p>

                    <h2 className="mt-2 text-2xl font-semibold text-emerald-950">
                    {selectedReport.as_of_date} · Revision{" "}
                    {selectedReport.revision}
                    </h2>

                    <p className="mt-2 text-sm text-emerald-800">
                    Prepared:{" "}
                    {formatDateTime(
                        selectedReport.prepared_at,
                        workspace.timezone,
                    )}
                    </p>
                </div>

                <span className="w-fit rounded-full bg-white px-3 py-1 text-sm font-medium text-emerald-700">
                    {selectedReport.status}
                </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-4">
                    <p className="text-xs text-slate-500">
                    Frozen items
                    </p>

                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {selectedReport.item_count}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-4 sm:col-span-2">
                    <p className="text-xs text-slate-500">
                    Total invested assets
                    </p>

                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatAmount(
                        Number(
                        selectedReport.total_value_base,
                        ),
                    )}{" "}
                    {selectedReport.base_currency}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                    Cash balances excluded
                    </p>
                </div>
                </div>

                <div className="mt-6 rounded-xl bg-white p-5">
                <h3 className="font-semibold text-slate-900">
                    Frozen report items
                </h3>

                <ul className="mt-4 divide-y divide-slate-200">
                    {selectedReportItems.map(
                    (item) => (
                        <li
                        key={item.id}
                        className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                        <div>
                            <p className="font-medium text-slate-900">
                            {item.instrument_ticker ||
                                item.instrument_name}
                            </p>

                            <p className="mt-1 text-sm text-slate-600">
                            {item.instrument_name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                            {[
                                item.owner_name,
                                item.provider_name,
                                item.account_name,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                            {item.asset_class_name ??
                                "Unclassified asset"}
                            {" · Snapshot "}
                            {item.source_snapshot_date}
                            {item.quantity !== null &&
                                ` · Quantity ${formatQuantity(
                                Number(item.quantity),
                                )}`}
                            </p>
                        </div>

                        <div className="text-left sm:text-right">
                            <p className="font-semibold text-slate-900">
                            {formatAmount(
                                Number(
                                item.market_value_base,
                                ),
                            )}{" "}
                            {
                                selectedReport.base_currency
                            }
                            </p>

                            {item.currency !==
                            selectedReport.base_currency && (
                            <p className="mt-1 text-xs text-slate-500">
                                {formatAmount(
                                Number(
                                    item.market_value,
                                ),
                                )}{" "}
                                {item.currency}
                            </p>
                            )}
                        </div>
                        </li>
                    ),
                    )}
                </ul>
                </div>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4 text-sm leading-6 text-emerald-800">
                This revision will remain unchanged even if
                operations, valuations or instrument names
                are edited later.
                </div>
            </section>
            )}

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                <h2 className="text-xl font-semibold">
                    Recent monthly report snapshots
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                    The twenty most recent frozen report
                    revisions.
                </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {reportHistory.length}
                </span>
            </div>

            {reportHistory.length > 0 ? (
                <ul className="mt-6 divide-y divide-slate-200">
                {reportHistory.map((report) => {
                    if (
                    !report.report_run_id ||
                    !report.as_of_date
                    ) {
                    return null;
                    }

                    return (
                    <li
                        key={report.report_run_id}
                        className="py-4 first:pt-0 last:pb-0"
                    >
                        <Link
                        href={buildReportRunHref(
                            report.as_of_date,
                            report.report_run_id,
                        )}
                        className="flex flex-col gap-3 rounded-xl p-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                        >
                        <div>
                            <p className="font-medium text-slate-900">
                            {report.as_of_date} · Revision{" "}
                            {report.revision}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(
                                report.prepared_at,
                                workspace.timezone,
                            )}
                            {" · "}
                            {report.item_count} items
                            {" · "}
                            {report.status}
                            </p>
                        </div>

                        <p className="font-semibold text-slate-900">
                            {formatAmount(
                            Number(
                                report.total_value_base ??
                                0,
                            ),
                            )}{" "}
                            {report.base_currency}
                        </p>
                        </Link>
                    </li>
                    );
                })}
                </ul>
            ) : (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                    No frozen report snapshots
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                    Complete all required valuations and
                    create the first monthly report snapshot.
                </p>
                </div>
            )}
            </section>

      </div>
    </main>
  );
}