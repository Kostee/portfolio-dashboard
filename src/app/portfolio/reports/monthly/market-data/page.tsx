import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getDateInTimeZone,
  isValidIsoDate,
} from "../../../operations/form-helpers";
import {
  applyAutomaticMonthlyMarketProposals,
} from "./actions";

type MarketDataPageProps = {
  searchParams: Promise<{
    asOf?: string;
    error?: string;
    success?: string;
  }>;
};

type Proposal = {
  account_id: string;
  instrument_id: string;
  owner_name: string;
  provider_name: string;
  account_name: string;
  instrument_name: string;
  instrument_ticker: string | null;
  instrument_exchange: string | null;
  quantity: number | string;
  existing_snapshot_date: string | null;
  existing_valuation_status: string | null;
  quote_date: string | null;
  unit_price: number | string | null;
  currency: string | null;
  quote_provider: string | null;
  quote_provider_symbol: string | null;
  quote_notes: string | null;
  fx_rate_date: string | null;
  fx_rate_to_base: number | string | null;
  market_value: number | string | null;
  market_value_base: number | string | null;
  proposal_status:
    | "already_confirmed"
    | "manual_only"
    | "missing_price"
    | "stale_price"
    | "missing_fx"
    | "stale_fx"
    | "ready";
};

type SyncRun = {
  id: string;
  status: string;
  target_saturday: string;
  market_data_through_date: string;
  instrument_success_count: number;
  instrument_failure_count: number;
  fx_success_count: number;
  fx_failure_count: number;
  started_at: string;
  completed_at: string | null;
};

function getSecondSaturday(
  dateValue: string,
): string {
  const [
    yearString,
    monthString,
  ] = dateValue.split("-");

  const year =
    Number(yearString);

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
    (
      6 -
      firstDayOfMonth +
      7
    ) % 7;

  const secondSaturdayDay =
    1 +
    daysUntilFirstSaturday +
    7;

  return [
    String(year).padStart(
      4,
      "0",
    ),
    String(
      monthIndex + 1,
    ).padStart(
      2,
      "0",
    ),
    String(
      secondSaturdayDay,
    ).padStart(
      2,
      "0",
    ),
  ].join("-");
}

function formatQuantity(
  value:
    | number
    | string,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    },
  ).format(Number(value));
}

function formatAmount(
  value:
    | number
    | string
    | null,
): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(Number(value));
}

function formatUnitPrice(
  value:
    | number
    | string
    | null,
): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    },
  ).format(Number(value));
}

function statusLabel(
  status:
    Proposal["proposal_status"],
): string {
  switch (status) {
    case "ready":
      return "Ready to accept";
    case "already_confirmed":
      return "Already confirmed";
    case "manual_only":
      return "Manual valuation";
    case "missing_price":
      return "Missing automatic price";
    case "stale_price":
      return "Automatic price is stale";
    case "missing_fx":
      return "Missing FX rate";
    case "stale_fx":
      return "FX rate is stale";
  }
}

function statusClassName(
  status:
    Proposal["proposal_status"],
): string {
  if (
    status === "ready"
  ) {
    return "bg-blue-50 text-blue-800";
  }

  if (
    status ===
    "already_confirmed"
  ) {
    return "bg-emerald-50 text-emerald-800";
  }

  if (
    status ===
    "manual_only"
  ) {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-amber-50 text-amber-800";
}

export default async function MarketDataPage({
  searchParams,
}: MarketDataPageProps) {
  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  if (
    !claimsData?.claims
  ) {
    redirect(
      "/portfolio/login",
    );
  }

  const {
    data: membership,
    error:
      membershipError,
  } = await supabase
    .from(
      "workspace_members",
    )
    .select(
      "workspace_id, role",
    )
    .order(
      "created_at",
      { ascending: true },
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    redirect(
      "/portfolio",
    );
  }

  const {
    data: workspace,
    error:
      workspaceError,
  } = await supabase
    .from("workspaces")
    .select(
      "name, timezone, base_currency",
    )
    .eq(
      "id",
      membership.workspace_id,
    )
    .single();

  if (
    workspaceError ||
    !workspace
  ) {
    redirect(
      "/portfolio",
    );
  }

  const {
    asOf:
      requestedAsOfDate,
    error: errorCode,
    success:
      successCode,
  } = await searchParams;

  const today =
    getDateInTimeZone(
      workspace.timezone,
    );

  const defaultReportDate =
    getSecondSaturday(
      today,
    );

  const asOfDate =
    requestedAsOfDate &&
    isValidIsoDate(
      requestedAsOfDate,
    )
      ? requestedAsOfDate
      : defaultReportDate;

  const [
    proposalResult,
    syncRunResult,
  ] = await Promise.all([
    supabase.rpc(
      "get_monthly_market_proposals",
      {
        p_workspace_id:
          membership.workspace_id,
        p_as_of_date:
          asOfDate,
      },
    ),

    supabase
      .from(
        "market_data_sync_runs",
      )
      .select(
        "id, status, target_saturday, market_data_through_date, instrument_success_count, instrument_failure_count, fx_success_count, fx_failure_count, started_at, completed_at",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "target_saturday",
        asOfDate,
      )
      .maybeSingle(),
  ]);

  if (
    proposalResult.error
  ) {
    console.error(
      "Market proposal query failed:",
      proposalResult.error,
    );
  }

  if (
    syncRunResult.error
  ) {
    console.error(
      "Market sync run query failed:",
      syncRunResult.error,
    );
  }

  const proposals =
    (
      proposalResult.data ??
      []
    ) as Proposal[];

  const syncRun =
    (
      syncRunResult.data ??
      null
    ) as SyncRun | null;

  const readyCount =
    proposals.filter(
      (proposal) =>
        proposal.proposal_status ===
        "ready",
    ).length;

  const confirmedCount =
    proposals.filter(
      (proposal) =>
        proposal.proposal_status ===
        "already_confirmed",
    ).length;

  const manualCount =
    proposals.filter(
      (proposal) =>
        proposal.proposal_status ===
        "manual_only",
    ).length;

  const issueCount =
    proposals.length -
    readyCount -
    confirmedCount -
    manualCount;

  const canEdit =
    membership.role ===
      "admin" ||
    membership.role ===
      "editor";

  const appliedMatch =
    successCode?.match(
      /^applied_(\d+)$/,
    );

  const successMessage =
    appliedMatch
      ? `${appliedMatch[1]} automatic market proposal(s) were accepted for ${asOfDate}.`
      : null;

  const errorMessage =
    errorCode ===
      "date_invalid"
      ? "Enter a valid report date."
      : errorCode ===
          "forbidden"
        ? "You cannot apply market proposals in this workspace."
        : errorCode ===
            "workspace_not_found"
          ? "The portfolio workspace is unavailable."
          : errorCode ===
              "apply_failed"
            ? "Automatic market proposals could not be applied."
            : null;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href={`/portfolio/reports/monthly?asOf=${encodeURIComponent(asOfDate)}`}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Monthly report
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Monthly reporting
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Automatic market data
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {workspace.name} · report date {asOfDate}
          </p>
        </header>

        {successMessage && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Sync status
            </p>
            <p className="mt-2 text-xl font-semibold capitalize">
              {syncRun?.status ?? "not run"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Ready
            </p>
            <p className="mt-2 text-xl font-semibold">
              {readyCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Confirmed
            </p>
            <p className="mt-2 text-xl font-semibold">
              {confirmedCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Manual
            </p>
            <p className="mt-2 text-xl font-semibold">
              {manualCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Issues
            </p>
            <p className="mt-2 text-xl font-semibold">
              {issueCount}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Weekly sync
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Automatic prices use the last completed market close no later than the Friday before the report. USD/PLN and EUR/PLN use the latest NBP table A rate available through that Friday. BTC uses the Friday BTC/EUR daily candle.
              </p>

              {syncRun && (
                <p className="mt-3 text-xs text-slate-500">
                  Market data through:{" "}
                  {syncRun.market_data_through_date}
                  {" · "}
                  instruments:{" "}
                  {syncRun.instrument_success_count} ok /{" "}
                  {syncRun.instrument_failure_count} failed
                  {" · "}
                  FX:{" "}
                  {syncRun.fx_success_count} ok /{" "}
                  {syncRun.fx_failure_count} failed
                </p>
              )}
            </div>

            {canEdit && readyCount > 0 && (
              <form
                action={
                  applyAutomaticMonthlyMarketProposals
                }
              >
                <input
                  type="hidden"
                  name="asOfDate"
                  value={asOfDate}
                />

                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Accept {readyCount} automatic proposal
                  {readyCount === 1 ? "" : "s"}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-xl font-semibold">
              Position proposals
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Review ledger quantities and fetched closes before accepting. Existing exact-date confirmed snapshots are never overwritten by this bulk action.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    Position
                  </th>
                  <th className="px-4 py-3">
                    Quantity
                  </th>
                  <th className="px-4 py-3">
                    Close
                  </th>
                  <th className="px-4 py-3">
                    Native value
                  </th>
                  <th className="px-4 py-3">
                    PLN value
                  </th>
                  <th className="px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {proposals.map((proposal) => (
                  <tr
                    key={`${proposal.account_id}:${proposal.instrument_id}`}
                    className="align-top"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">
                        {proposal.instrument_ticker ?? proposal.instrument_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {proposal.owner_name}
                        {" · "}
                        {proposal.provider_name}
                        {" · "}
                        {proposal.account_name}
                      </p>

                      {proposal.instrument_exchange && (
                        <p className="mt-1 text-xs text-slate-400">
                          {proposal.instrument_exchange}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 font-medium">
                      {formatQuantity(proposal.quantity)}
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium">
                        {formatUnitPrice(proposal.unit_price)}
                        {proposal.currency ? ` ${proposal.currency}` : ""}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {proposal.quote_date ?? "—"}
                        {proposal.quote_provider
                          ? ` · ${proposal.quote_provider}`
                          : ""}
                        {proposal.quote_provider_symbol
                          ? ` · ${proposal.quote_provider_symbol}`
                          : ""}
                      </p>

                      {proposal.fx_rate_to_base !== null && (
                        <p className="mt-1 text-xs text-slate-500">
                          FX {proposal.currency}/PLN:{" "}
                          {formatUnitPrice(proposal.fx_rate_to_base)}
                          {" · "}
                          {proposal.fx_rate_date ?? "—"}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 font-medium">
                      {formatAmount(proposal.market_value)}
                      {proposal.currency
                        ? ` ${proposal.currency}`
                        : ""}
                    </td>

                    <td className="px-4 py-4 font-medium">
                      {formatAmount(proposal.market_value_base)} PLN
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName(proposal.proposal_status)}`}
                      >
                        {statusLabel(proposal.proposal_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Still manual
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Government bonds remain manually valued because their accrued value is not a normal exchange close. PPK remains a reported-balance workflow and must be read from the provider. Cash is not part of monthly chart readiness.
          </p>
        </section>
      </div>
    </main>
  );
}
