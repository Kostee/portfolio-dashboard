import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { setPassword } from "./actions";

type SetPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SetPasswordPage({
  searchParams,
}: SetPasswordPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/portfolio/login");
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Portfolio
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          Set your password
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Create a password to finish activating your portfolio account.
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <form action={setPassword} className="mt-7 space-y-5">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              New password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="passwordConfirmation"
              className="block text-sm font-medium text-slate-700"
            >
              Confirm new password
            </label>

            <input
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Use at least 12 characters, including an uppercase letter, a
            lowercase letter and a digit.
          </p>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            Save password
          </button>
        </form>
      </section>
    </main>
  );
}