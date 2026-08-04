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

  const { workspace_error: workspaceError } = await searchParams;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Workspace membership query failed:", membershipError);
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
      .select("id, name, base_currency, timezone")
      .eq("id", membership.workspace_id)
      .single();

    if (error) {
      console.error("Workspace query failed:", error);
    } else {
      workspace = data;
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
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
              A workspace groups portfolio owners, accounts, instruments,
              transactions and reports. You will become its administrator.
            </p>

            {workspaceError === "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter a workspace name.
              </p>
            )}

            {workspaceError === "creation_failed" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The workspace could not be created. Check the server log and try
                again.
              </p>
            )}

            <form action={createWorkspace} className="mt-6 space-y-4">
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

                  <p className="mt-1 font-medium">PLN</p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Timezone
                  </p>

                  <p className="mt-1 font-medium">Europe/Warsaw</p>
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
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
              Active workspace
            </p>

            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{workspace.name}</h2>

                <p className="mt-2 text-sm text-slate-600">
                  The workspace foundation is ready for portfolio configuration.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                Role: {membership.role}
              </span>
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Base currency
                </dt>

                <dd className="mt-1 font-medium">
                  {workspace.base_currency}
                </dd>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Timezone
                </dt>

                <dd className="mt-1 font-medium">{workspace.timezone}</dd>
              </div>
            </dl>
            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
                Portfolio configuration
              </p>

              <Link
                href="/portfolio/owners"
                className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">Portfolio owners</p>

                  <p className="mt-1 text-sm text-slate-600">
                    Manage the people to whom accounts and assets belong.
                  </p>
                </div>

                <span
                  aria-hidden="true"
                  className="text-xl text-slate-400"
                >
                  →
                </span>
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}