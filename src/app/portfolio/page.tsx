import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { logout } from "./actions";

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims;

  if (!claims) {
    redirect("/portfolio/login");
  }

  const email =
    typeof claims.email === "string" ? claims.email : "Authenticated user";

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

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Authentication works</h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            The private portfolio area is ready. Portfolio data, accounts,
            transactions and reports will be added in the next stages.
          </p>
        </section>
      </div>
    </main>
  );
}