import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { DEFAULT_ASSET_CLASSES } from "./default-asset-classes";
import { seedDefaultAssetClasses } from "./actions";

type AssetClassesPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function AssetClassesPage({
  searchParams,
}: AssetClassesPageProps) {
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
    { data: assetClasses, error: assetClassesError },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("asset_classes")
      .select(
        "id, code, name, color_hex, sort_order, include_in_allocation_chart, include_in_xirr, is_active",
      )
      .eq("workspace_id", membership.workspace_id)
      .order("sort_order", { ascending: true }),
  ]);

  if (assetClassesError) {
    console.error(
      "Asset classes query failed:",
      assetClassesError,
    );
  }

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const hasAssetClasses =
    assetClasses && assetClasses.length > 0;

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
            Asset classes
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        {success === "defaults_added" && (
          <p className="mt-8 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            The default asset classes were added.
          </p>
        )}

        {errorCode === "already_initialized" && (
          <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Asset classes have already been initialized.
          </p>
        )}

        {errorCode === "forbidden" && (
          <p className="mt-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Your workspace role does not allow editing.
          </p>
        )}

        {(errorCode === "creation_failed" ||
          errorCode === "workspace_not_found") && (
          <p className="mt-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            The asset classes could not be created. Check the
            server log.
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Current asset classes
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Asset classes control portfolio grouping,
                allocation colors and XIRR inclusion.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {assetClasses?.length ?? 0}
            </span>
          </div>

          {hasAssetClasses ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {assetClasses.map((assetClass) => (
                <li
                  key={assetClass.id}
                  className="grid gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1 h-5 w-5 shrink-0 rounded-full border border-black/10"
                      style={{
                        backgroundColor: assetClass.color_hex,
                      }}
                    />

                    <div>
                      <p className="font-medium">
                        {assetClass.name}
                      </p>

                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {assetClass.code}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Order {assetClass.sort_order}
                    </span>

                    {assetClass.include_in_allocation_chart && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        Allocation chart
                      </span>
                    )}

                    <span
                      className={
                        assetClass.include_in_xirr
                          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                          : "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
                      }
                    >
                      {assetClass.include_in_xirr
                        ? "Included in XIRR"
                        : "Excluded from XIRR"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6">
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <h3 className="font-medium">
                  Initialize the default structure
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This will add the seven asset classes used by
                  the portfolio reporting system.
                </p>

                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {DEFAULT_ASSET_CLASSES.map((assetClass) => (
                    <li
                      key={assetClass.code}
                      className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                        style={{
                          backgroundColor: assetClass.colorHex,
                        }}
                      />

                      <span className="text-sm font-medium">
                        {assetClass.name}
                      </span>
                    </li>
                  ))}
                </ul>

                {canEdit && (
                  <form
                    action={seedDefaultAssetClasses}
                    className="mt-6"
                  >
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      Add default asset classes
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}