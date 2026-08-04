import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createOwner } from "./actions";

type OwnersPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function OwnersPage({
  searchParams,
}: OwnersPageProps) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode, success } = await searchParams;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Workspace membership query failed:", membershipError);
  }

  if (!membership) {
    redirect("/portfolio");
  }

  const [{ data: workspace }, { data: owners, error: ownersError }] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("name")
        .eq("id", membership.workspace_id)
        .single(),

      supabase
        .from("owners")
        .select("id, display_name, is_active, sort_order")
        .eq("workspace_id", membership.workspace_id)
        .order("sort_order", { ascending: true })
        .order("display_name", { ascending: true }),
    ]);

  if (ownersError) {
    console.error("Owners query failed:", ownersError);
  }

  const canEdit =
    membership.role === "admin" || membership.role === "editor";

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
            Portfolio owners
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace: {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Current owners</h2>

                <p className="mt-1 text-sm text-slate-600">
                  Owners represent the people to whom accounts and assets belong.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {owners?.length ?? 0}
              </span>
            </div>

            {owners && owners.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {owners.map((owner) => (
                  <li
                    key={owner.id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{owner.display_name}</p>

                      <p className="mt-1 text-xs text-slate-500">
                        Display order: {owner.sort_order}
                      </p>
                    </div>

                    <span
                      className={
                        owner.is_active
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      }
                    >
                      {owner.is_active ? "Active" : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">No portfolio owners yet</p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start by adding Jakub and Natalia. Accounts will later be
                  assigned to one of these owners.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Add owner</h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the person’s display name. It must be unique within the
              workspace.
            </p>

            {success === "owner_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The portfolio owner was added.
              </p>
            )}

            {errorCode === "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter the owner’s name.
              </p>
            )}

            {errorCode === "duplicate_name" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                An owner with this name already exists.
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
                The owner could not be added. Check the server log.
              </p>
            )}

            {canEdit ? (
              <form action={createOwner} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Display name
                  </label>

                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="Jakub"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add owner
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This workspace is read-only for your current role.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}