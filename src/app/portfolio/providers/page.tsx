import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createProvider } from "./actions";
import {
  PROVIDER_TYPE_LABELS,
  PROVIDER_TYPES,
} from "./provider-types";

type ProvidersPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function ProvidersPage({
  searchParams,
}: ProvidersPageProps) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode, success } = await searchParams;

  const { data: membership, error: membershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (membershipError) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );
  }

  if (!membership) {
    redirect("/portfolio");
  }

  const [
    { data: workspace },
    { data: providers, error: providersError },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("providers")
      .select("id, name, provider_type, is_active")
      .eq("workspace_id", membership.workspace_id)
      .order("name", { ascending: true }),
  ]);

  if (providersError) {
    console.error("Providers query failed:", providersError);
  }

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Portfolio Dashboard
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Portfolio configuration
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Providers
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current providers
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Providers represent brokers, banks, fund
                  managers and investment platforms.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {providers?.length ?? 0}
              </span>
            </div>

            {providers && providers.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {providers.map((provider) => (
                  <li
                    key={provider.id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {provider.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {
                          PROVIDER_TYPE_LABELS[
                            provider.provider_type
                          ]
                        }
                      </p>
                    </div>

                    <span
                      className={
                        provider.is_active
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      }
                    >
                      {provider.is_active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No providers yet
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start with XTB, Pekao, Pekao TFI S.A.
                  and Binance.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add provider
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Provider names must be unique within the
              workspace.
            </p>

            {success === "provider_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The provider was added.
              </p>
            )}

            {errorCode === "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter the provider name.
              </p>
            )}

            {errorCode === "type_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select a valid provider type.
              </p>
            )}

            {errorCode === "duplicate_name" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                A provider with this name already exists.
              </p>
            )}

            {errorCode === "forbidden" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Your workspace role does not allow editing.
              </p>
            )}

            {(errorCode === "creation_failed" ||
              errorCode === "workspace_not_found") && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The provider could not be added. Check the
                server log.
              </p>
            )}

            {canEdit ? (
              <form
                action={createProvider}
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="providerName"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Provider name
                  </label>

                  <input
                    id="providerName"
                    name="providerName"
                    type="text"
                    required
                    maxLength={150}
                    placeholder="XTB"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="providerType"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Provider type
                  </label>

                  <select
                    id="providerType"
                    name="providerType"
                    defaultValue="brokerage"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {PROVIDER_TYPES.map((providerType) => (
                      <option
                        key={providerType}
                        value={providerType}
                      >
                        {
                          PROVIDER_TYPE_LABELS[
                            providerType
                          ]
                        }
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add provider
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This workspace is read-only for your current
                role.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}