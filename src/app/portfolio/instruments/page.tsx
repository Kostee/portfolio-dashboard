import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createInstrument } from "./actions";
import {
  INSTRUMENT_CURRENCIES,
  INSTRUMENT_KIND_LABELS,
  INSTRUMENT_KINDS,
  TRACKING_MODE_LABELS,
  TRACKING_MODES,
} from "./instrument-options";

type InstrumentsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function InstrumentsPage({
  searchParams,
}: InstrumentsPageProps) {
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
    { data: instruments, error: instrumentsError },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("asset_classes")
      .select("id, name, color_hex, sort_order, is_active")
      .eq("workspace_id", membership.workspace_id)
      .order("sort_order", { ascending: true }),

    supabase
      .from("instruments")
      .select(
        "id, name, ticker, exchange, isin, asset_class_id, instrument_kind, tracking_mode, default_currency, is_active",
      )
      .eq("workspace_id", membership.workspace_id),
  ]);

  if (assetClassesError) {
    console.error(
      "Asset classes query failed:",
      assetClassesError,
    );
  }

  if (instrumentsError) {
    console.error(
      "Instruments query failed:",
      instrumentsError,
    );
  }

  const assetClassMap = new Map(
    (assetClasses ?? []).map((assetClass) => [
      assetClass.id,
      assetClass,
    ]),
  );

  const activeAssetClasses = (assetClasses ?? []).filter(
    (assetClass) => assetClass.is_active,
  );

  const sortedInstruments = [...(instruments ?? [])].sort(
    (first, second) => {
      const firstAssetClass = assetClassMap.get(
        first.asset_class_id,
      );
      const secondAssetClass = assetClassMap.get(
        second.asset_class_id,
      );

      const orderDifference =
        (firstAssetClass?.sort_order ?? 999) -
        (secondAssetClass?.sort_order ?? 999);

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return first.name.localeCompare(second.name);
    },
  );

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
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
            Instruments
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current instruments
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Instruments define what can be held, valued and
                  used in transactions and reports.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {sortedInstruments.length}
              </span>
            </div>

            {sortedInstruments.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {sortedInstruments.map((instrument) => {
                  const assetClass = assetClassMap.get(
                    instrument.asset_class_id,
                  );

                  const marketReference = [
                    instrument.ticker,
                    instrument.exchange,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <li
                      key={instrument.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="mt-1 h-5 w-5 shrink-0 rounded-full border border-black/10"
                            style={{
                              backgroundColor:
                                assetClass?.color_hex ??
                                "#CBD5E1",
                            }}
                          />

                          <div>
                            <p className="font-medium">
                              {instrument.name}
                            </p>

                            {marketReference && (
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                {marketReference}
                              </p>
                            )}

                            <p className="mt-1 text-sm text-slate-600">
                              {assetClass?.name ??
                                "Unknown asset class"}
                            </p>

                            {instrument.isin && (
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                ISIN: {instrument.isin}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {
                              INSTRUMENT_KIND_LABELS[
                                instrument.instrument_kind
                              ]
                            }
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {
                              TRACKING_MODE_LABELS[
                                instrument.tracking_mode
                              ]
                            }
                          </span>

                          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                            {instrument.default_currency}
                          </span>

                          <span
                            className={
                              instrument.is_active
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                            }
                          >
                            {instrument.is_active
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No instruments yet
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add the first instrument after selecting its
                  asset class, kind, tracking mode and currency.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add instrument
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use units and price for traded instruments. Use a
              reported balance for assets entered as a total
              account value.
            </p>

            {success === "instrument_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The instrument was added.
              </p>
            )}

            {errorCode === "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter the instrument name.
              </p>
            )}

            {errorCode === "asset_class_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select an asset class.
              </p>
            )}

            {(errorCode === "kind_required" ||
              errorCode === "tracking_mode_required" ||
              errorCode === "currency_required") && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select valid instrument settings.
              </p>
            )}

            {errorCode === "invalid_isin" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter a valid twelve-character ISIN or leave it
                blank.
              </p>
            )}

            {errorCode === "invalid_asset_class" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The selected asset class is unavailable.
              </p>
            )}

            {errorCode === "duplicate_instrument" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                An instrument with this ticker, exchange or ISIN
                already exists.
              </p>
            )}

            {errorCode === "forbidden" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Your workspace role does not allow editing.
              </p>
            )}

            {(errorCode === "creation_failed" ||
              errorCode === "workspace_not_found" ||
              errorCode === "invalid_data") && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The instrument could not be added. Check the
                server log.
              </p>
            )}

            {activeAssetClasses.length === 0 && (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Add at least one active asset class before
                creating instruments.
              </p>
            )}

            {canEdit && activeAssetClasses.length > 0 ? (
              <form
                action={createInstrument}
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="instrumentName"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Instrument name
                  </label>

                  <input
                    id="instrumentName"
                    name="instrumentName"
                    type="text"
                    required
                    maxLength={200}
                    placeholder="XTB"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ticker"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Ticker
                    </label>

                    <input
                      id="ticker"
                      name="ticker"
                      type="text"
                      maxLength={30}
                      placeholder="XTB"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="exchange"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Exchange
                    </label>

                    <input
                      id="exchange"
                      name="exchange"
                      type="text"
                      maxLength={30}
                      placeholder="GPW"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="isin"
                    className="block text-sm font-medium text-slate-700"
                  >
                    ISIN
                  </label>

                  <input
                    id="isin"
                    name="isin"
                    type="text"
                    maxLength={12}
                    placeholder="Optional"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="assetClassId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Asset class
                  </label>

                  <select
                    id="assetClassId"
                    name="assetClassId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select asset class
                    </option>

                    {activeAssetClasses.map((assetClass) => (
                      <option
                        key={assetClass.id}
                        value={assetClass.id}
                      >
                        {assetClass.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="instrumentKind"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Instrument kind
                  </label>

                  <select
                    id="instrumentKind"
                    name="instrumentKind"
                    defaultValue="stock"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {INSTRUMENT_KINDS.map((instrumentKind) => (
                      <option
                        key={instrumentKind}
                        value={instrumentKind}
                      >
                        {
                          INSTRUMENT_KIND_LABELS[
                            instrumentKind
                          ]
                        }
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="trackingMode"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Tracking mode
                  </label>

                  <select
                    id="trackingMode"
                    name="trackingMode"
                    defaultValue="units"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {TRACKING_MODES.map((trackingMode) => (
                      <option
                        key={trackingMode}
                        value={trackingMode}
                      >
                        {
                          TRACKING_MODE_LABELS[
                            trackingMode
                          ]
                        }
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="defaultCurrency"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Default currency
                  </label>

                  <select
                    id="defaultCurrency"
                    name="defaultCurrency"
                    defaultValue="PLN"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {INSTRUMENT_CURRENCIES.map((currency) => (
                      <option
                        key={currency}
                        value={currency}
                      >
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add instrument
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Instrument creation is unavailable.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}