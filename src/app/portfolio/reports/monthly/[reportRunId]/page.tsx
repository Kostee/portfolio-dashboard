import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  buildMonthlyChartData,
  type MonthlyReportItem,
  type MonthlyReportRun,
  type MonthlyXirrSnapshot,
  type PortfolioValueHistoryRecord,
} from "@/lib/reports/monthly-chart-data";

import {
  GpwPortfolioChart,
} from "@/components/reports/monthly/gpw-portfolio-chart";

import {
  AssetsByAccountChart,
} from "@/components/reports/monthly/assets-by-account-chart";

import {
  AssetClassStructureChart,
} from "@/components/reports/monthly/asset-class-structure-chart";

import {
  PortfolioHistoryChart,
} from "@/components/reports/monthly/portfolio-history-chart";

import {
  ForeignMarketAssetsChart,
} from "@/components/reports/monthly/foreign-market-assets-chart";

import {
  DownloadAllMonthlyChartsButton,
} from "@/components/reports/monthly/download-all-monthly-charts-button";

type MonthlyReportDetailsPageProps = {
  params: Promise<{
    reportRunId: string;
  }>;
};

type XirrCashFlowItem = Pick<
  Database["public"]["Tables"]["portfolio_xirr_cash_flow_items"]["Row"],
  | "id"
  | "sequence_no"
  | "flow_date"
  | "flow_kind"
  | "amount_base"
  | "base_currency"
  | "source_kind"
  | "description"
>;

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

function formatSignedAmount(
  value: number,
): string {
  const sign =
    value > 0 ? "+" : "";

  return `${sign}${formatAmount(value)}`;
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

function formatXirrPercentage(
  rate: number,
): string {
  const percentage =
    rate * 100;

  const sign =
    percentage > 0 ? "+" : "";

  return `${sign}${new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(percentage)}%`;
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
    legacyHistoryResult,
    xirrHistoryResult,
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

    supabase
      .from(
        "portfolio_value_history_points",
      )
      .select(
        "id, workspace_id, as_of_date, total_value_base, cumulative_contributions_base, base_currency, source, notes",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("as_of_date", {
        ascending: true,
      }),

    supabase
      .from("portfolio_xirr_snapshots")
      .select(
        "id, workspace_id, report_run_id, as_of_date, xirr_rate, terminal_value_base, terminal_invested_value_base, terminal_cash_value_base, cash_flow_count, calculation_version, created_at",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("as_of_date", {
        ascending: true,
      })
      .order("created_at", {
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

  if (legacyHistoryResult.error) {
    console.error(
      "Legacy portfolio history query failed:",
      legacyHistoryResult.error,
    );

    throw new Error(
      "The historical portfolio-value series could not be loaded.",
    );
  }

  if (xirrHistoryResult.error) {
    console.error(
      "Monthly report XIRR history query failed:",
      xirrHistoryResult.error,
    );

    throw new Error(
      "The XIRR history could not be loaded.",
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

  const legacyHistoryPoints =
    (legacyHistoryResult.data ??
      []) as PortfolioValueHistoryRecord[];

  const xirrSnapshots =
    (xirrHistoryResult.data ??
      []) as MonthlyXirrSnapshot[];

  const chartData =
    buildMonthlyChartData({
      reportRun,
      reportItems,
      historyRuns,
      legacyHistoryPoints,
      xirrSnapshots,
    });

  const report =
    chartData.report;

  const currentXirr =
    chartData.xirr.current;

  let xirrCashFlowItems:
    XirrCashFlowItem[] = [];

  if (currentXirr) {
    const {
      data: xirrCashFlowData,
      error: xirrCashFlowError,
    } = await supabase
      .from(
        "portfolio_xirr_cash_flow_items",
      )
      .select(
        "id, sequence_no, flow_date, flow_kind, amount_base, base_currency, source_kind, description",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "xirr_snapshot_id",
        currentXirr.xirrSnapshotId,
      )
      .order("sequence_no", {
        ascending: true,
      });

    if (xirrCashFlowError) {
      console.error(
        "Frozen XIRR cash-flow query failed:",
        xirrCashFlowError,
      );

      throw new Error(
        "The frozen XIRR cash-flow vector could not be loaded.",
      );
    }

    xirrCashFlowItems =
      (xirrCashFlowData ??
        []) as XirrCashFlowItem[];
  }

  const contributionReturnPercentage =
    report.cumulativeContributionsBase !==
      null &&
    report.cumulativeContributionsBase >
      0 &&
    report.portfolioGainBase !== null
      ? (
          report.portfolioGainBase /
          report.cumulativeContributionsBase
        ) *
        100
      : null;

  const availableChartCount =
    [
      chartData.gpw.items.length >
        0,

      chartData.accounts.items.length >
        0,

      chartData.assetClasses.items.length >
        0,

      chartData.history.points.length >
        0,

      chartData.foreign.groups.length >
        0,
    ].filter(Boolean).length;

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
            {report.asOfDate}
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

          <div className="mt-5">
            <DownloadAllMonthlyChartsButton
                availableChartCount={
                availableChartCount
                }
            />
          </div>
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
                Cumulative contributions
            </p>

            {report.cumulativeContributionsBase !==
            null ? (
                <>
                <p className="mt-2 text-2xl font-semibold">
                    {formatAmount(
                    report.cumulativeContributionsBase,
                    )}{" "}
                    {report.baseCurrency}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                    Baseline:{" "}
                    {report.contributionBaselineDate ??
                    "Unavailable"}
                </p>
                </>
            ) : (
                <p className="mt-2 text-lg font-semibold text-amber-700">
                Not available
                </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
                Gain above contributions
            </p>

            {report.portfolioGainBase !==
            null ? (
                <>
                <p
                    className={
                    report.portfolioGainBase >= 0
                        ? "mt-2 text-2xl font-semibold text-emerald-700"
                        : "mt-2 text-2xl font-semibold text-red-700"
                    }
                >
                    {formatSignedAmount(
                    report.portfolioGainBase,
                    )}{" "}
                    {report.baseCurrency}
                </p>

                {contributionReturnPercentage !==
                    null && (
                    <p
                    className={
                        contributionReturnPercentage >=
                        0
                        ? "mt-1 text-xs font-medium text-emerald-700"
                        : "mt-1 text-xs font-medium text-red-700"
                    }
                    >
                    {contributionReturnPercentage >
                    0
                        ? "+"
                        : ""}
                    {formatPercentage(
                        contributionReturnPercentage,
                    )}
                    % of cumulative contributions
                    </p>
                )}
                </>
            ) : (
                <p className="mt-2 text-lg font-semibold text-amber-700">
                Not available
                </p>
            )}
        </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Annualised XIRR
            </p>

            {currentXirr ? (
              <>
                <p
                  className={
                    currentXirr.xirrRate >= 0
                      ? "mt-2 text-2xl font-semibold text-emerald-700"
                      : "mt-2 text-2xl font-semibold text-red-700"
                  }
                >
                  {formatXirrPercentage(
                    currentXirr.xirrRate,
                  )}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  PPK excluded · non-PPK cash included
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg font-semibold text-amber-700">
                Not available
              </p>
            )}
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
            data. Cash balances are excluded from
            every chart. Cumulative contributions
            are calculated from the baseline dated{" "}
            <span className="font-semibold">
                {report.contributionBaselineDate ??
                "—"}
            </span>
            {" "}and later external deposits and
            withdrawals.
        </div>

        {report.cumulativeContributionsBase ===
            null && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
                This report does not contain frozen
                cumulative-contribution data. Configure
                a contribution baseline and create a
                new report.
            </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Performance
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                XIRR
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Annualised money-weighted return.
                Contributions are negative cash
                flows, withdrawals are positive,
                and the terminal value includes
                non-PPK invested assets plus
                non-PPK free cash.
              </p>
            </div>

            {currentXirr && (
              <p
                className={
                  currentXirr.xirrRate >= 0
                    ? "text-2xl font-semibold text-emerald-700"
                    : "text-2xl font-semibold text-red-700"
                }
              >
                {formatXirrPercentage(
                  currentXirr.xirrRate,
                )}
              </p>
            )}
          </div>

          {currentXirr ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    Non-PPK invested assets
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {formatAmount(
                      currentXirr
                        .terminalInvestedValueBase ??
                        0,
                    )}{" "}
                    {report.baseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    Non-PPK free cash
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {formatSignedAmount(
                      currentXirr
                        .terminalCashValueBase ??
                        0,
                    )}{" "}
                    {report.baseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    XIRR terminal value
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {formatAmount(
                      currentXirr
                        .terminalValueBase ??
                        0,
                    )}{" "}
                    {report.baseCurrency}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    Frozen cash flows
                  </p>

                  <p className="mt-2 text-lg font-semibold">
                    {currentXirr.cashFlowCount ??
                      xirrCashFlowItems.length}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {
                      currentXirr
                        .calculationVersion
                    }
                  </p>
                </div>
              </div>

              <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-5 py-4 font-medium text-slate-900">
                  Audit frozen XIRR cash-flow vector
                </summary>

                <div className="overflow-x-auto border-t border-slate-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          #
                        </th>

                        <th className="px-4 py-3">
                          Date
                        </th>

                        <th className="px-4 py-3">
                          Kind
                        </th>

                        <th className="px-4 py-3">
                          Amount
                        </th>

                        <th className="px-4 py-3">
                          Source
                        </th>

                        <th className="px-4 py-3">
                          Description
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {xirrCashFlowItems.map(
                        (item) => (
                          <tr key={item.id}>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                              {item.sequence_no}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                              {item.flow_date}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 capitalize">
                              {item.flow_kind.replaceAll(
                                "_",
                                " ",
                              )}
                            </td>

                            <td
                              className={
                                Number(
                                  item.amount_base,
                                ) >= 0
                                  ? "whitespace-nowrap px-4 py-3 font-medium text-emerald-700"
                                  : "whitespace-nowrap px-4 py-3 font-medium text-slate-900"
                              }
                            >
                              {formatSignedAmount(
                                Number(
                                  item.amount_base,
                                ),
                              )}{" "}
                              {
                                item.base_currency
                              }
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                              {item.source_kind.replaceAll(
                                "_",
                                " ",
                              )}
                            </td>

                            <td className="min-w-64 px-4 py-3 text-slate-600">
                              {item.description ??
                                "—"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
              This report does not have a frozen
              XIRR snapshot. Create the report again
              with the current reporting workflow.
            </div>
          )}

          <div className="mt-6">
            <h3 className="font-semibold">
              XIRR history
            </h3>

            {chartData.xirr.history.length >
            0 ? (
              <ul className="mt-4 divide-y divide-slate-200">
                {chartData.xirr.history.map(
                  (point) => (
                    <li
                      key={
                        point.xirrSnapshotId
                      }
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {point.asOfDate}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {point.revision !==
                          null
                            ? "Frozen report"
                            : "Legacy checkpoint"}
                          {" · "}
                          {
                            point.calculationVersion
                          }
                        </p>
                      </div>

                      <p
                        className={
                          point.xirrRate >= 0
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {formatXirrPercentage(
                          point.xirrRate,
                        )}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                No XIRR history is available.
              </p>
            )}
          </div>
        </section>

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

        {chartData.gpw.items.length > 0 && (
            <div className="mt-6">
            <GpwPortfolioChart
                items={chartData.gpw.items}
                totalValueBase={
                chartData.gpw.totalValueBase
                }
                asOfDate={report.asOfDate}
                revision={report.revision}
                baseCurrency={report.baseCurrency}
            />
            </div>
        )}

        {chartData.gpw.items.length > 0 ? (
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
                    value={item.marketValueBase}
                    percentage={item.percentage}
                    currency={report.baseCurrency}
                    color={item.assetClassColor}
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

          {chartData.accounts.items.length >
            0 && (
            <div className="mt-6">
                <AssetsByAccountChart
                items={
                    chartData.accounts.items
                }
                totalValueBase={
                    chartData.accounts
                    .totalValueBase
                }
                asOfDate={
                    report.asOfDate
                }
                revision={
                    report.revision
                }
                baseCurrency={
                    report.baseCurrency
                }
                />
            </div>
          )}

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

          {chartData.assetClasses.items.length >
            0 && (
            <div className="mt-6">
                <AssetClassStructureChart
                items={
                    chartData.assetClasses.items
                }
                totalValueBase={
                    chartData.assetClasses
                    .totalValueBase
                }
                asOfDate={
                    report.asOfDate
                }
                revision={
                    report.revision
                }
                baseCurrency={
                    report.baseCurrency
                }
                />
            </div>
            )}

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
              Historical checkpoints are shown from
              2025-11-12. For a date with a frozen
              monthly report, that report takes
              precedence over the imported historical
              checkpoint.
            </p>
          </div>

          {chartData.history.points.length >
            0 && (
            <div className="mt-6">
                <PortfolioHistoryChart
                points={
                    chartData.history.points
                }
                asOfDate={
                    report.asOfDate
                }
                revision={
                    report.revision
                }
                baseCurrency={
                    report.baseCurrency
                }
                />
            </div>
            )}

          {chartData.history.points.length >
          0 ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {chartData.history.points.map(
                (point) => (
                  <li
                    key={
                      point.historyPointId
                    }
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {point.asOfDate}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {point.source ===
                        "report"
                          ? `Frozen report · ${point.status}`
                          : "Imported historical checkpoint"}
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
              This report history does not contain
              frozen cumulative-contribution values.
              Configure a contribution baseline and
              create a new report.
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

          {chartData.foreign.groups.length > 0 && (
            <div className="mt-6">
                <ForeignMarketAssetsChart
                groups={
                    chartData.foreign.groups
                }
                totalValueBase={
                    chartData.foreign
                    .totalValueBase
                }
                asOfDate={
                    report.asOfDate
                }
                revision={
                    report.revision
                }
                baseCurrency={
                    report.baseCurrency
                }
                />
            </div>
            )}

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