import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { logout } from "./actions";
import { createWorkspace } from "./workspace-actions";

type PortfolioPageProps = {
  searchParams: Promise<{
    workspace_error?: string;
  }>;
};

const PRIMARY_NAVIGATION = [
  {
    href: "/portfolio/state",
    eyebrow: "Portfolio",
    title: "Current state",
    description:
      "See current holdings, cash balances, account breakdowns and valuation warnings.",
  },
  {
    href: "/portfolio/operations",
    eyebrow: "Ledger",
    title: "Operations",
    description:
      "Record deposits, withdrawals, trades, transfers, exchanges and other portfolio events.",
  },
  {
    href: "/portfolio/reports",
    eyebrow: "Analysis",
    title: "Reports",
    description:
      "Open daily market data, weekly operation summaries, monthly reports and performance inputs.",
  },
] as const;

const PORTFOLIO_TOOLS = [
  {
    href: "/portfolio/valuations",
    title: "Valuations",
    description:
      "Maintain manual valuations and review valuation-related portfolio data.",
  },
  {
    href: "/portfolio/opening-state",
    title: "Opening state",
    description:
      "Review and maintain the portfolio state used as the ledger starting point.",
  },
] as const;

const CONFIGURATION_NAVIGATION = [
  {
    href: "/portfolio/owners",
    title: "Portfolio owners",
    description:
      "Manage the people to whom accounts and assets belong.",
  },
  {
    href: "/portfolio/providers",
    title: "Providers",
    description:
      "Manage brokers, banks and investment platforms.",
  },
  {
    href: "/portfolio/accounts",
    title: "Accounts",
    description:
      "Manage account ownership, providers, types and currencies.",
  },
  {
    href: "/portfolio/instruments",
    title: "Instruments",
    description:
      "Manage traded assets, identifiers and valuation methods.",
  },
  {
    href: "/portfolio/asset-classes",
    title: "Asset classes",
    description:
      "Manage allocation groups, colors and XIRR inclusion.",
  },
] as const;

export default async function PortfolioPage({
  searchParams,
}: PortfolioPageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  const claims = claimsData?.claims;

  if (!claims) {
    redirect("/portfolio/login");
  }

  const email =
    typeof claims.email === "string"
      ? claims.email
      : "Authenticated user";

  const { workspace_error: workspaceError } =
    await searchParams;

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

  let workspace: {
    id: string;
    name: string;
    base_currency: string;
    timezone: string;
  } | null = null;

  if (membership) {
    const { data, error } = await supabase
      .from("workspaces")
      .select(
        "id, name, base_currency, timezone",
      )
      .eq(
        "id",
        membership.workspace_id,
      )
      .single();

    if (error) {
      console.error(
        "Workspace query failed:",
        error,
      );
    } else {
      workspace = data;
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
              Kosterna
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Portfolio Dashboard
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Signed in as {email}
            </p>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </header>

        {!membership || !workspace ? (
          <section className="mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
              Initial setup
            </p>

            <h2 className="mt-2 text-2xl font-semibold">
              Create your portfolio workspace
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              A workspace groups portfolio owners,
              accounts, instruments, transactions and
              reports. You will become its administrator.
            </p>

            {workspaceError ===
              "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter a workspace name.
              </p>
            )}

            {workspaceError ===
              "creation_failed" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The workspace could not be created.
                Check the server log and try again.
              </p>
            )}

            <form
              action={createWorkspace}
              className="mt-6 space-y-4"
            >
              <div>
                <label
                  htmlFor="workspaceName"
                  className="block text-sm font-medium text-slate-700"
                >
                  Workspace name
                </label>

                <input
                  id="workspaceName"
                  name="workspaceName"
                  type="text"
                  required
                  maxLength={100}
                  defaultValue="Kosterna Portfolio"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Base currency
                  </p>

                  <p className="mt-1 font-medium">
                    PLN
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Timezone
                  </p>

                  <p className="mt-1 font-medium">
                    Europe/Warsaw
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Create workspace
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                    Active workspace
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    {workspace.name}
                  </h2>

                  <p className="mt-2 text-sm text-slate-600">
                    Portfolio workspace ready for daily
                    operations, monitoring and reporting.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                    {workspace.base_currency}
                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                    {workspace.timezone}
                  </span>

                  <span className="rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white">
                    {membership.role}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                  Work with portfolio
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Main workspace
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  The three places you will use most often.
                </p>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                {PRIMARY_NAVIGATION.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex min-h-56 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          {item.eyebrow}
                        </p>

                        <h3 className="mt-2 text-xl font-semibold text-slate-900">
                          {item.title}
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>
                      </div>

                      <p className="mt-6 text-sm font-medium text-slate-900">
                        Open
                        <span
                          aria-hidden="true"
                          className="ml-2 inline-block transition-transform group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </p>
                    </Link>
                  ),
                )}
              </div>
            </section>

            <section className="mt-8 border-t border-slate-200 pt-8">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                  Portfolio tools
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Supporting data used by the current
                  state and reporting workflows.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {PORTFOLIO_TOOLS.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between gap-5 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {item.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className="shrink-0 text-xl text-slate-400 transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </Link>
                  ),
                )}
              </div>
            </section>

            <section className="mt-8 border-t border-slate-200 pt-8">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                  Configuration
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  Less frequently changed portfolio
                  structure and reference data.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {CONFIGURATION_NAVIGATION.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between gap-5 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {item.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className="shrink-0 text-xl text-slate-400 transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </Link>
                  ),
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}