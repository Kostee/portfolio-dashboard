import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  AssetClassNetAllocationChart,
} from "@/components/reports/weekly/asset-class-net-allocation-chart";

import {
  DownloadAllWeeklyChartsButton,
} from "@/components/reports/weekly/download-all-weekly-charts-button";

import {
  InstrumentNetTradesChart,
} from "@/components/reports/weekly/instrument-net-trades-chart";

import {
  buildWeeklyOperationChartData,
} from "@/lib/reports/weekly-operation-chart-data";

import {
  createClient,
} from "@/lib/supabase/server";

type WeeklyReportDetailsPageProps = {
  params: Promise<{
    reportRunId: string;
  }>;
};

function formatAmount(
  value: number,
  currency: string,
): string {
  return (
    new Intl.NumberFormat(
      "en-GB",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(value) +
    ` ${currency}`
  );
}

export default async function WeeklyReportDetailsPage({
  params,
}: WeeklyReportDetailsPageProps) {
  const {
    reportRunId,
  } =
    await params;

  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect(
      "/portfolio/login",
    );
  }

  const {
    data: membership,
  } =
    await supabase
      .from(
        "workspace_members",
      )
      .select(
        "workspace_id",
      )
      .order(
        "created_at",
        {
          ascending: true,
        },
      )
      .limit(1)
      .maybeSingle();

  if (!membership) {
    redirect(
      "/portfolio",
    );
  }

  const [
    runResult,
    itemsResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "portfolio_weekly_report_runs",
        )
        .select(
          "id, workspace_id, from_date, to_date, base_currency, external_contributions_base, bought_base, sold_base, net_trading_base, fx_rates, item_count, generated_at",
        )
        .eq(
          "id",
          reportRunId,
        )
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .maybeSingle(),

      supabase
        .from(
          "portfolio_weekly_report_items",
        )
        .select(
          "id, report_run_id, instrument_id, instrument_name, instrument_ticker, asset_class_id, asset_class_name, asset_class_code, asset_class_color, asset_class_sort_order, buy_quantity, sell_quantity, net_quantity, bought_base, sold_base, net_value_base, operation_count",
        )
        .eq(
          "report_run_id",
          reportRunId,
        ),
    ]);

  if (
    runResult.error
  ) {
    console.error(
      "Weekly report query failed:",
      runResult.error,
    );

    notFound();
  }

  if (
    itemsResult.error
  ) {
    console.error(
      "Weekly report items query failed:",
      itemsResult.error,
    );

    notFound();
  }

  if (!runResult.data) {
    notFound();
  }

  const chartData =
    buildWeeklyOperationChartData({
      reportRun:
        runResult.data,

      reportItems:
        itemsResult.data ??
        [],
    });

  const report =
    chartData.report;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8">
      <Link
        href="/portfolio/reports/weekly"
        className="text-sm text-slate-600 hover:text-slate-900"
      >
        ← Weekly reports
      </Link>

      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Trading activity
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Weekly operation report
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {report.fromDate}
            {" → "}
            {report.toDate}
          </p>
        </div>

        <DownloadAllWeeklyChartsButton />
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            External contributions
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatAmount(
              report.externalContributionsBase,
              report.baseCurrency,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Bought
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatAmount(
              report.boughtBase,
              report.baseCurrency,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Sold
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatAmount(
              report.soldBase,
              report.baseCurrency,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Net trading
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatAmount(
              report.netTradingBase,
              report.baseCurrency,
            )}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Chart 1
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Net instrument trades
          </h2>
        </div>

        <div className="mt-5">
          <InstrumentNetTradesChart
            items={
              chartData.instruments
            }
            fromDate={
              report.fromDate
            }
            toDate={
              report.toDate
            }
            baseCurrency={
              report.baseCurrency
            }
            boughtBase={
              report.boughtBase
            }
            soldBase={
              report.soldBase
            }
            netTradingBase={
              report.netTradingBase
            }
            externalContributionsBase={
              report.externalContributionsBase
            }
          />
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Chart 2
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Net allocation by asset class
          </h2>
        </div>

        <div className="mt-5">
          <AssetClassNetAllocationChart
            items={
              chartData.assetClasses.items
            }
            fromDate={
              report.fromDate
            }
            toDate={
              report.toDate
            }
            baseCurrency={
              report.baseCurrency
            }
            netTradingBase={
              report.netTradingBase
            }
            externalContributionsBase={
              report.externalContributionsBase
            }
          />
        </div>
      </section>
    </main>
  );
}