import Link from "next/link";

import {
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  WeeklyReportGenerator,
} from "@/components/reports/weekly/weekly-report-generator";

import {
  getDateInTimeZone,
} from "@/app/portfolio/operations/form-helpers";

type WeeklyReportsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    report?: string;
    from?: string;
    to?: string;
  }>;
};

const ERROR_MESSAGES:
  Record<
    string,
    string
  > = {
    from_date_invalid:
      "Enter a valid start date.",

    to_date_invalid:
      "Enter a valid end date.",

    date_range_invalid:
      "The start date cannot be later than the end date.",

    workspace_unavailable:
      "The workspace could not be loaded.",

    permission_denied:
      "Editor access is required to generate reports.",

    unsupported_base_currency:
      "Weekly operation charts currently require a PLN-base workspace.",

    operations_unavailable:
      "Portfolio operations could not be loaded.",

    instruments_unavailable:
      "Instrument metadata could not be loaded.",

    asset_classes_unavailable:
      "Asset-class metadata could not be loaded.",

    fx_rate_unavailable:
      "A required historical FX rate could not be resolved.",

    report_lookup_failed:
      "Existing reports could not be checked.",

    report_creation_failed:
      "The weekly report could not be generated.",
  };

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
    .slice(0, 10);
}

function formatAmount(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value) +
    ` ${currency}`;
}

export default async function WeeklyReportsPage({
  searchParams,
}: WeeklyReportsPageProps) {
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

  const params =
    await searchParams;

  const {
    data: membership,
  } =
    await supabase
      .from("workspace_members")
      .select(
        "workspace_id, role",
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
    workspaceResult,
    reportsResult,
  ] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select(
          "name, timezone",
        )
        .eq(
          "id",
          membership.workspace_id,
        )
        .single(),

      supabase
        .from(
          "portfolio_weekly_report_runs",
        )
        .select(
            "id, from_date, to_date, base_currency, external_contributions_base, bought_base, sold_base, net_trading_base, item_count, generated_at",
        )
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .order(
          "to_date",
          {
            ascending: false,
          },
        )
        .order(
          "from_date",
          {
            ascending: false,
          },
        ),
    ]);

  const workspace =
    workspaceResult.data;

  const reports =
    reportsResult.data ??
    [];

  if (!workspace) {
    redirect(
      "/portfolio",
    );
  }

  const today =
    getDateInTimeZone(
      workspace.timezone ??
        "Europe/Warsaw",
    );

  const defaultFromDate =
    params.from ??
    shiftIsoDate(
      today,
      -2,
    );

  const defaultToDate =
    params.to ??
    today;

  const canEdit =
    membership.role ===
      "admin" ||
    membership.role ===
      "editor";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <Link
        href="/portfolio"
        className="text-sm text-slate-600 hover:text-slate-900"
      >
        ← Portfolio
      </Link>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Trading activity
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Weekly operation charts
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Generate two frozen charts from
          posted buy and sell operations over
          any inclusive date range. Instruments
          and asset classes are shown on a net
          buy-minus-sell basis.
        </p>
      </div>

      {params.error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERROR_MESSAGES[
            params.error
          ] ??
            "The report could not be generated."}
        </div>
      )}

      {params.success && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {params.success ===
          "replaced"
            ? "The existing report was replaced successfully."
            : "The report was generated successfully."}

          {params.report && (
            <>
              {" "}
              <Link
                href={`/portfolio/reports/weekly/${params.report}`}
                className="font-semibold underline"
              >
                Open report
              </Link>
            </>
          )}
        </div>
      )}

      {canEdit && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-950">
            Generate report
          </h2>

          <div className="mt-4">
            <WeeklyReportGenerator
              defaultFromDate={
                defaultFromDate
              }
              defaultToDate={
                defaultToDate
              }
              existingRanges={
                reports.map(
                  (report) => ({
                    id:
                      report.id,

                    fromDate:
                      report.from_date,

                    toDate:
                      report.to_date,
                  }),
                )
              }
            />
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-950">
          Saved reports
        </h2>

        {reports.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-500">
            No weekly operation reports have
            been generated yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {reports.map(
              (report) => (
                <Link
                  key={report.id}
                  href={`/portfolio/reports/weekly/${report.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {report.from_date}
                        {" → "}
                        {report.to_date}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {report.item_count}{" "}
                        {report.item_count === 1
                            ? "instrument"
                            : "instruments"}
                      </p>
                    </div>

                    <div className="text-sm sm:text-right">
                      <p className="font-medium text-slate-900">
                        Net{" "}
                        {formatAmount(
                          report.net_trading_base,
                          report.base_currency,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Contributions{" "}
                        {formatAmount(
                          report.external_contributions_base,
                          report.base_currency,
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  );
}