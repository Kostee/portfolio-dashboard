import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  buildMonthlyChartData,
  type MonthlyReportItem,
  type MonthlyReportRun,
} from "@/lib/reports/monthly-chart-data";

type MonthlyReportDetailsPageProps = {
  params: Promise<{
    reportRunId: string;
  }>;
};

type PreviewBarProps = {
  label: string;
  description?: string;

  value: number;
  percentage: number;

  currency: string;
  color?: string;
};

function formatAmount(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function formatQuantity(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    },
  ).format(value);
}

function formatPercentage(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(value);
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

function PreviewBar({
  label,
  description,
  value,
  percentage,
  currency,
  color = "#334155",
}: PreviewBarProps) {
  const barWidth =
    percentage <= 0
      ? 0
      : Math.max(
          2,
          Math.min(100, percentage),
        );

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-slate-900">
            {label}
          </p>

          {description && (
            <p className="mt-1 text-xs text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="font-semibold text-slate-900">
            {formatAmount(value)}{" "}
            {currency}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {formatPercentage(
              percentage,
            )}
            %
          </p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{
            width: `${barWidth}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </li>
  );
}

export default async function MonthlyReportDetailsPage({
  params,
}: MonthlyReportDetailsPageProps) {
  const { reportRunId } =
    await params;

  const supabase =
    await createClient();

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

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

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
    .eq(
      "id",
      membership.workspace_id,
    )
    .single();

  if (
    workspaceError ||
    !workspace
  ) {
    console.error(
      "Workspace query failed:",
      workspaceError,
    );

    redirect("/portfolio");
  }

  const [
    reportResult,
    itemsResult,
    historyResult,
  ] = await Promise.all([
    supabase
      .from("portfolio_report_runs")
      .select(
        "id, workspace_id, report_type, as_of_date, revision, status, base_currency, item_count, total_value_base, prepared_at, generated_at, contribution_baseline_id, contribution_baseline_date, cumulative_contributions_base"
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("id", reportRunId)
      .eq(
        "report_type",
        "monthly",
      )
      .maybeSingle(),

    supabase
      .from("portfolio_report_items")
      .select(
        "id, report_run_id, item_type, source_snapshot_date, account_id, owner_id, owner_name, provider_id, provider_name, account_name, account_type, account_currency, instrument_id, instrument_name, instrument_ticker, instrument_kind, tracking_mode, instrument_exchange, asset_class_id, asset_class_name, asset_class_code, asset_class_color, asset_class_sort_order, quantity, unit_price, market_value, currency, market_value_base",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "report_run_id",
        reportRunId,
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

    supabase
      .from("portfolio_report_runs")
      .select(
        "id, workspace_id, report_type, as_of_date, revision, status, base_currency, item_count, total_value_base, prepared_at, generated_at, contribution_baseline_id, contribution_baseline_date, cumulative_contributions_base"
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "report_type",
        "monthly",
      )
      .neq("status", "voided")
      .order("as_of_date", {
        ascending: true,
      })
      .order("revision", {
        ascending: true,
      }),
  ]);

  if (reportResult.error) {
    console.error(
      "Monthly report run query failed:",
      reportResult.error,
    );

    throw new Error(
      "The monthly report could not be loaded.",
    );
  }

  if (!reportResult.data) {
    notFound();
  }

  if (itemsResult.error) {
    console.error(
      "Monthly report items query failed:",
      itemsResult.error,
    );

    throw new Error(
      "The frozen report items could not be loaded.",
    );
  }

  if (historyResult.error) {
    console.error(
      "Monthly report history query failed:",
      historyResult.error,
    );

    throw new Error(
      "The monthly report history could not be loaded.",
    );
  }

  const reportRun =
    reportResult.data as MonthlyReportRun;

  const reportItems =
    (itemsResult.data ??
      []) as MonthlyReportItem[];

  const historyRuns =
    (historyResult.data ??
      []) as MonthlyReportRun[];

  const chartData =
    buildMonthlyChartData({
      reportRun,
      reportItems,
      historyRuns,
    });

  const report =
    chartData.report;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/reports/monthly"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Monthly reports
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Frozen monthly report
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {report.asOfDate} · Revision{" "}
            {report.revision}
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace: {workspace.name}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Prepared:{" "}
            {formatDateTime(
              reportRun.prepared_at,
              workspace.timezone,
            )}
          </p>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total invested assets
            </p>

            <p className="mt-2 text-2xl font-semibold">
              {formatAmount(
                report.frozenTotalValueBase,
              )}{" "}
              {report.baseCurrency}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Frozen items
            </p>

            <p className="mt-2 text-2xl font-semibold">
              {report.frozenItemCount}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Report status
            </p>

            <p className="mt-2 text-2xl font-semibold capitalize">
              {reportRun.status}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Data consistency
            </p>

            <p
              className={
                report.totalMatches
                  ? "mt-2 text-2xl font-semibold text-emerald-700"
                  : "mt-2 text-2xl font-semibold text-red-700"
              }
            >
              {report.totalMatches
                ? "Matched"
                : "Mismatch"}
            </p>

            {!report.totalMatches && (
              <p className="mt-1 text-xs text-red-600">
                Difference:{" "}
                {formatAmount(
                  report.totalDifference,
                )}{" "}
                {report.baseCurrency}
              </p>
            )}
          </div>
        </section>

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
          These previews use only frozen report
          items. Cash balances are excluded from
          every dataset.
        </div>

        {/* 1. GPW */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Chart 1
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Polish stocks by instrument
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Positions are aggregated by
                instrument across accounts.
              </p>
            </div>

            <p className="font-semibold">
              {formatAmount(
                chartData.gpw.totalValueBase,
              )}{" "}
              {report.baseCurrency}
            </p>
          </div>

          {chartData.gpw.items.length >
          0 ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {chartData.gpw.items.map(
                (item) => (
                  <PreviewBar
                    key={item.instrumentId}
                    label={
                      item.instrumentTicker ??
                      item.instrumentName
                    }
                    description={`${item.instrumentName} · Quantity ${formatQuantity(
                      item.quantity,
                    )}`}
                    value={
                      item.marketValueBase
                    }
                    percentage={
                      item.percentage
                    }
                    currency={
                      report.baseCurrency
                    }
                    color={
                      item.assetClassColor
                    }
                  />
                ),
              )}
            </ul>
          ) : (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              This frozen report does not
              contain Polish stocks.
            </p>
          )}
        </section>

        {/* 2. Accounts */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Chart 2
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Assets by account
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                All invested assets and PPK
                balances grouped by account.
              </p>
            </div>

            <p className="font-semibold">
              {formatAmount(
                chartData.accounts
                  .totalValueBase,
              )}{" "}
              {report.baseCurrency}
            </p>
          </div>

          <ul className="mt-6 divide-y divide-slate-200">
            {chartData.accounts.items.map(
              (item) => (
                <PreviewBar
                  key={item.accountId}
                  label={`${item.ownerName} · ${item.accountName}`}
                  description={`${item.providerName} · ${item.accountType}`}
                  value={
                    item.marketValueBase
                  }
                  percentage={
                    item.percentage
                  }
                  currency={
                    report.baseCurrency
                  }
                />
              ),
            )}
          </ul>
        </section>

        {/* 3. Asset classes */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Chart 3
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Asset-class structure
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                The frozen seven-class portfolio
                structure used by the monthly
                composition chart.
              </p>
            </div>

            <p className="font-semibold">
              {formatAmount(
                chartData.assetClasses
                  .totalValueBase,
              )}{" "}
              {report.baseCurrency}
            </p>
          </div>

          <ul className="mt-6 divide-y divide-slate-200">
            {chartData.assetClasses.items.map(
              (item) => (
                <PreviewBar
                  key={
                    item.assetClassCode ??
                    item.assetClassId ??
                    item.assetClassName
                  }
                  label={
                    item.assetClassName
                  }
                  description={`${item.itemCount} frozen items`}
                  value={
                    item.marketValueBase
                  }
                  percentage={
                    item.percentage
                  }
                  currency={
                    report.baseCurrency
                  }
                  color={
                    item.assetClassColor
                  }
                />
              ),
            )}
          </ul>
        </section>

        {/* 4. History */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
              Chart 4
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              Portfolio value history
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              The latest non-voided revision for
              every report date is included.
            </p>
          </div>

          {chartData.history.points.length >
          0 ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {chartData.history.points.map(
                (point) => (
                  <li
                    key={
                      point.reportRunId
                    }
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {point.asOfDate}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Revision{" "}
                        {point.revision} ·{" "}
                        {point.status}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                        <p className="font-semibold">
                            {formatAmount(
                            point.totalValueBase,
                            )}{" "}
                            {report.baseCurrency}
                        </p>

                        {point.cumulativeContributionsBase !==
                            null && (
                            <>
                            <p className="mt-1 text-xs text-slate-500">
                                Contributions:{" "}
                                {formatAmount(
                                point.cumulativeContributionsBase,
                                )}{" "}
                                {report.baseCurrency}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                                Gain:{" "}
                                {formatAmount(
                                point.portfolioGainBase ?? 0,
                                )}{" "}
                                {report.baseCurrency}
                            </p>
                          </>
                        )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-slate-600">
              No monthly report history is
              available.
            </p>
          )}

          {!chartData.history
            .contributionsAvailable && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Portfolio-value history is ready.
              The cumulative contribution series
              will be added in the next database
              step before PNG rendering.
            </div>
          )}
        </section>

        {/* 5. Foreign assets */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Chart 5
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Foreign-market assets
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Global ETFs, U.S. REITs and
                semiconductor stocks. Every
                instrument receives its own bar.
              </p>
            </div>

            <div className="text-left lg:text-right">
              <p className="font-semibold">
                {formatAmount(
                  chartData.foreign
                    .totalValueBase,
                )}{" "}
                {report.baseCurrency}
              </p>

              {chartData.foreign
                .currencyTotals.length >
                0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {chartData.foreign.currencyTotals
                    .map(
                      (total) =>
                        `${formatAmount(
                          total.marketValue,
                        )} ${total.currency}`,
                    )
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>

          {chartData.foreign.groups
            .length > 0 ? (
            <div className="mt-6 space-y-8">
              {chartData.foreign.groups.map(
                (group) => (
                  <div
                    key={
                      group.assetClassCode
                    }
                  >
                    <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-semibold">
                        {
                          group.assetClassName
                        }
                      </h3>

                      <p className="text-sm text-slate-600">
                        {formatAmount(
                          group.marketValueBase,
                        )}{" "}
                        {report.baseCurrency}
                        {" · "}
                        {formatPercentage(
                          group.percentage,
                        )}
                        %
                      </p>
                    </div>

                    <ul className="mt-4 divide-y divide-slate-200">
                      {group.items.map(
                        (item) => (
                          <PreviewBar
                            key={
                              item.instrumentId
                            }
                            label={
                              item.instrumentTicker ??
                              item.instrumentName
                            }
                            description={`${item.instrumentName} · Quantity ${formatQuantity(
                              item.quantity,
                            )} · ${formatAmount(
                              item.marketValue,
                            )} ${item.currency}`}
                            value={
                              item.marketValueBase
                            }
                            percentage={
                              item.percentage
                            }
                            currency={
                              report.baseCurrency
                            }
                            color={
                              group.assetClassColor
                            }
                          />
                        ),
                      )}
                    </ul>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              This frozen report does not
              contain foreign-market assets.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}