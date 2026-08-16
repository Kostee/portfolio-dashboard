import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  saveContributionBaseline,
} from "./actions";

type ContributionBaselinesPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

const ERROR_MESSAGES:
  Record<string, string> = {
    workspace_not_found:
      "The portfolio workspace is unavailable.",

    forbidden:
      "You cannot edit contribution baselines.",

    date_invalid:
      "Enter a valid baseline date.",

    value_invalid:
      "Enter a valid cumulative contribution value.",

    save_failed:
      "The contribution baseline could not be saved.",
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

export default async function ContributionBaselinesPage({
  searchParams,
}: ContributionBaselinesPageProps) {
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
    .select("workspace_id, role")
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

  const [
    workspaceResult,
    historyResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, base_currency")
      .eq(
        "id",
        membership.workspace_id,
      )
      .single(),

    supabase
      .from(
        "portfolio_contribution_baseline_history",
      )
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("baseline_date", {
        ascending: false,
      }),
  ]);

  if (
    workspaceResult.error ||
    !workspaceResult.data
  ) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );

    redirect("/portfolio");
  }

  if (historyResult.error) {
    console.error(
      "Contribution baseline history query failed:",
      historyResult.error,
    );
  }

  const {
    error: errorCode,
    success: successCode,
  } = await searchParams;

  const workspace =
    workspaceResult.data;

  const history =
    historyResult.data ?? [];

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/reports/monthly"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Monthly reports
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Performance history
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Contribution baselines
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace: {workspace.name}
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
          A baseline stores total cumulative external
          contributions through a selected date.
          Later deposits and withdrawals are applied
          automatically. Internal transfers, currency
          exchanges, trades, dividends and interest
          are excluded.
        </div>

        {successCode === "saved" && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            The contribution baseline was saved.
          </p>
        )}

        {errorCode && (
          <p className="mt-6 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">
            {ERROR_MESSAGES[errorCode] ??
              "The contribution baseline operation failed."}
          </p>
        )}

        {canEdit && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add or update baseline
            </h2>

            <form
              action={saveContributionBaseline}
              className="mt-6 grid gap-5 md:grid-cols-2"
            >
              <div>
                <label
                  htmlFor="baselineDate"
                  className="block text-sm font-medium text-slate-700"
                >
                  Baseline date
                </label>

                <input
                  id="baselineDate"
                  name="baselineDate"
                  type="date"
                  required
                  defaultValue="2026-06-13"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="cumulativeContributionsBase"
                  className="block text-sm font-medium text-slate-700"
                >
                  Cumulative contributions in{" "}
                  {workspace.base_currency}
                </label>

                <input
                  id="cumulativeContributionsBase"
                  name="cumulativeContributionsBase"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-slate-700"
                >
                  Notes
                </label>

                <input
                  id="notes"
                  name="notes"
                  type="text"
                  maxLength={500}
                  defaultValue="Opening cumulative contributions checkpoint"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 md:col-span-2"
              >
                Save contribution baseline
              </button>
            </form>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Baseline history
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                The latest baseline on or before a
                report date is used.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {history.length}
            </span>
          </div>

          {history.length > 0 ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {history.map((baseline) => (
                <li
                  key={baseline.baseline_id}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {baseline.baseline_date}
                    </p>

                    {baseline.notes && (
                      <p className="mt-1 text-xs text-slate-500">
                        {baseline.notes}
                      </p>
                    )}
                  </div>

                  <p className="font-semibold">
                    {formatAmount(
                      Number(
                        baseline.cumulative_contributions_base,
                      ),
                    )}{" "}
                    {workspace.base_currency}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <p className="font-medium">
                No contribution baseline
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Add the opening checkpoint before
                creating the first monthly report.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}