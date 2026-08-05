import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type UnitPosition =
  Database["public"]["Views"]["portfolio_current_unit_positions"]["Row"];

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
    maximumFractionDigits: 8,
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

function sortUnitPositions(
  positions: UnitPosition[],
): UnitPosition[] {
  return [...positions].sort((first, second) => {
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

    const firstInstrument =
      first.instrument_ticker ||
      first.instrument_name ||
      "";

    const secondInstrument =
      second.instrument_ticker ||
      second.instrument_name ||
      "";

    return firstInstrument.localeCompare(
      secondInstrument,
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

  const { data: membership, error: membershipError } =
    await supabase
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
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, base_currency")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("portfolio_current_unit_positions")
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("portfolio_current_cash_balances")
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
  ]);

  if (workspaceResult.error) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );
  }

  if (unitPositionsResult.error) {
    console.error(
      "Current unit positions query failed:",
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

  const workspace = workspaceResult.data;

  const unitPositions = sortUnitPositions(
    unitPositionsResult.data ?? [],
  );

  const cashBalances = sortCashBalances(
    cashBalancesResult.data ?? [],
  );

  const reportedBalances =
    sortReportedBalances(
      reportedBalancesResult.data ?? [],
    );

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

  const warningCount =
    negativeUnitPositions.length +
    negativeCashBalances.length +
    negativeReportedBalances.length;

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
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Unit positions
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {unitPositions.length}
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

        {warningCount > 0 ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Incomplete or inconsistent state
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              Negative positions or cash balances
              usually mean that an opening balance
              or an earlier operation has not yet
              been entered.
            </p>

            <div className="mt-4 space-y-2">
              {negativeUnitPositions.map(
                (position) => (
                  <p
                    key={`${position.account_id}-${position.instrument_id}`}
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
                    key={`${balance.account_id}-${balance.currency}`}
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
                    key={`${balance.account_id}-${balance.instrument_id}`}
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
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-lg font-semibold text-emerald-900">
              No negative balances
            </h2>

            <p className="mt-2 text-sm leading-6 text-emerald-800">
              All calculated positions and balances
              are currently non-negative.
            </p>
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current unit positions
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Quantities calculated from all
                  posted operation entries.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {unitPositions.length}
              </span>
            </div>

            {unitPositions.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {unitPositions.map((position) => {
                  const quantity = Number(
                    position.quantity ?? 0,
                  );

                  return (
                    <li
                      key={`${position.account_id}-${position.instrument_id}`}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {position.instrument_ticker ||
                              position.instrument_name}
                          </p>

                          <p className="mt-1 text-sm text-slate-600">
                            {position.instrument_name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {getAccountDescription(
                              position.owner_name,
                              position.provider_name,
                              position.account_name,
                            )}
                          </p>
                        </div>

                        <span
                          className={
                            quantity >= 0
                              ? "w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                              : "w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                          }
                        >
                          {quantity >= 0 ? "+" : ""}
                          {formatQuantity(quantity)}
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        Activity:{" "}
                        {position.first_activity_date ??
                          "—"}{" "}
                        →{" "}
                        {position.last_activity_date ??
                          "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>
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
                            {balance.account_currency}
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
                          {formatAmount(cashBalance)}{" "}
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
                Latest calculated balances for
                assets tracked as reported values,
                such as PPK.
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
      </div>
    </main>
  );
}