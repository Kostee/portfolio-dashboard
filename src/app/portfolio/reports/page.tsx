import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function PortfolioReportsPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Workspace membership query failed:", membershipError);
  }

  if (!membership) {
    redirect("/portfolio");
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", membership.workspace_id)
    .single();

  if (workspaceError) {
    console.error("Workspace query failed:", workspaceError);
  }

  const reports = [
    {
      href: "/portfolio/reports/daily-opens",
      eyebrow: "Daily market data",
      title: "Daily market opens",
      description:
        "Browse permanently stored opening prices by trading day and inspect the complete opening-price history for each instrument.",
    },
    {
      href: "/portfolio/reports/weekly",
      eyebrow: "Weekly reporting",
      title: "Weekly operation reports",
      description:
        "Generate and browse weekly trading summaries, instrument-level net activity and asset-class allocation charts.",
    },
    {
      href: "/portfolio/reports/monthly",
      eyebrow: "Monthly reporting",
      title: "Monthly portfolio reports",
      description:
        "Prepare dated portfolio snapshots and generate the full monthly reporting package.",
    },
    {
      href: "/portfolio/reports/monthly/market-data",
      eyebrow: "Monthly source data",
      title: "Monthly market data",
      description:
        "Review automatic closing-price proposals and the market data used to prepare monthly reports.",
    },
    {
      href: "/portfolio/reports/contributions",
      eyebrow: "Performance inputs",
      title: "Contribution baselines",
      description:
        "Review contribution baselines used by historical performance and XIRR calculations.",
    },
  ];

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
            Reporting hub
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Reports
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace: {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                {report.eyebrow}
              </p>

              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                {report.title}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {report.description}
              </p>

              <p className="mt-5 text-sm font-medium text-slate-900">
                Open report
                <span
                  aria-hidden="true"
                  className="ml-2 inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
