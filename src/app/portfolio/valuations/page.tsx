import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getDateInTimeZone } from "../operations/form-helpers";
import { OPERATION_CURRENCIES } from "../operations/operation-options";
import {
  upsertReportedBalanceSnapshot,
  upsertUnitsValuationSnapshot,
} from "./actions";

type ValuationsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

const ERROR_MESSAGES: Record<
  string,
  string
> = {
  workspace_not_found:
    "The portfolio workspace is unavailable.",
  forbidden:
    "You cannot add valuations in this workspace.",
  date_invalid:
    "Enter a valid snapshot date.",
  reported_account_required:
    "Select an account for the reported balance.",
  reported_instrument_required:
    "Select a reported-balance instrument.",
  reported_value_invalid:
    "Enter a valid reported value.",
  reported_base_value_invalid:
    "Enter a valid base-currency value or leave it empty.",
  units_account_required:
    "Select an account for the units valuation.",
  units_instrument_required:
    "Select a units-based instrument.",
  quantity_invalid:
    "Enter a quantity greater than zero.",
  units_value_invalid:
    "Enter a valid total market value.",
  units_base_value_invalid:
    "Enter a valid base-currency value or leave it empty.",
  unit_price_invalid:
    "Enter a valid unit price or leave it empty.",
  currency_invalid:
    "Select a supported currency.",
  currency_mismatch:
    "The currency must match the instrument currency.",
  invalid_account:
    "The selected account is unavailable.",
  invalid_instrument:
    "The selected instrument is unavailable.",
  invalid_balance_instrument:
    "The selected instrument is not tracked as a reported balance.",
  invalid_units_instrument:
    "The selected instrument is not tracked using units.",
  snapshot_failed:
    "The valuation snapshot could not be saved.",
};

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

export default async function ValuationsPage({
  searchParams,
}: ValuationsPageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode, success } =
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

  if (!membership) {
    redirect("/portfolio");
  }

  const [
    workspaceResult,
    ownersResult,
    providersResult,
    accountsResult,
    instrumentsResult,
    historyResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "name, timezone, base_currency",
      )
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("owners")
      .select(
        "id, display_name, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("providers")
      .select("id, name")
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, provider_id, name, base_currency",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),

    supabase
      .from("instruments")
      .select(
        "id, name, ticker, default_currency, tracking_mode",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),

    supabase
      .from(
        "portfolio_position_snapshot_history",
      )
      .select("*")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("snapshot_date", {
        ascending: false,
      })
      .order("updated_at", {
        ascending: false,
      })
      .limit(100),
  ]);

  const workspace = workspaceResult.data;
  const owners = ownersResult.data ?? [];
  const providers =
    providersResult.data ?? [];
  const accounts = accountsResult.data ?? [];
  const instruments =
    instrumentsResult.data ?? [];
  const history = historyResult.data ?? [];

  if (workspaceResult.error) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );
  }

  if (ownersResult.error) {
    console.error(
      "Owners query failed:",
      ownersResult.error,
    );
  }

  if (providersResult.error) {
    console.error(
      "Providers query failed:",
      providersResult.error,
    );
  }

  if (accountsResult.error) {
    console.error(
      "Accounts query failed:",
      accountsResult.error,
    );
  }

  if (instrumentsResult.error) {
    console.error(
      "Instruments query failed:",
      instrumentsResult.error,
    );
  }

  if (historyResult.error) {
    console.error(
      "Snapshot history query failed:",
      historyResult.error,
    );
  }

  const ownerMap = new Map(
    owners.map((owner) => [
      owner.id,
      owner,
    ]),
  );

  const providerMap = new Map(
    providers.map((provider) => [
      provider.id,
      provider,
    ]),
  );

  const sortedAccounts = [...accounts].sort(
    (first, second) => {
      const firstOwner =
        ownerMap.get(first.owner_id);

      const secondOwner =
        ownerMap.get(second.owner_id);

      const ownerOrderDifference =
        (firstOwner?.sort_order ?? 999) -
        (secondOwner?.sort_order ?? 999);

      if (ownerOrderDifference !== 0) {
        return ownerOrderDifference;
      }

      return first.name.localeCompare(
        second.name,
      );
    },
  );

  const balanceInstruments = instruments
    .filter(
      (instrument) =>
        instrument.tracking_mode === "balance",
    )
    .sort((first, second) =>
      first.name.localeCompare(second.name),
    );

  const unitsInstruments = instruments
    .filter(
      (instrument) =>
        instrument.tracking_mode === "units",
    )
    .sort((first, second) =>
      first.name.localeCompare(second.name),
    );

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const workspaceTimeZone =
    workspace?.timezone ?? "Europe/Warsaw";

  const workspaceBaseCurrency =
    workspace?.base_currency ?? "PLN";

  const defaultDate = getDateInTimeZone(
    workspaceTimeZone,
  );

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ??
      "The valuation could not be saved."
    : null;

  const renderAccountOptions = () =>
    sortedAccounts.map((account) => (
      <option
        key={account.id}
        value={account.id}
      >
        {[
          ownerMap.get(account.owner_id)
            ?.display_name,
          providerMap.get(account.provider_id)
            ?.name,
          account.name,
          account.base_currency,
        ]
          .filter(Boolean)
          .join(" · ")}
      </option>
    ));

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/state"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Portfolio state
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Portfolio valuation
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Position snapshots
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
          A snapshot stores the value observed on a
          specific date. Saving the same account,
          instrument and date again updates the
          existing snapshot instead of creating a
          duplicate.
        </div>

        {success === "snapshot_saved" && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            The valuation snapshot was saved.
          </p>
        )}

        {errorMessage && (
          <p className="mt-6 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Reported balance
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use for PPK and other assets for which
              the provider reports one current total
              value.
            </p>

            {canEdit &&
            sortedAccounts.length > 0 &&
            balanceInstruments.length > 0 ? (
              <form
                action={
                  upsertReportedBalanceSnapshot
                }
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="reportedSnapshotDate"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Snapshot date
                  </label>

                  <input
                    id="reportedSnapshotDate"
                    name="snapshotDate"
                    type="date"
                    required
                    defaultValue={defaultDate}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reportedAccountId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account
                  </label>

                  <select
                    id="reportedAccountId"
                    name="accountId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select account
                    </option>

                    {renderAccountOptions()}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="reportedInstrumentId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Instrument
                  </label>

                  <select
                    id="reportedInstrumentId"
                    name="instrumentId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select instrument
                    </option>

                    {balanceInstruments.map(
                      (instrument) => (
                        <option
                          key={instrument.id}
                          value={instrument.id}
                        >
                          {instrument.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reportedMarketValue"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Reported value
                    </label>

                    <input
                      id="reportedMarketValue"
                      name="marketValue"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="2500.00"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reportedCurrency"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Currency
                    </label>

                    <select
                      id="reportedCurrency"
                      name="currency"
                      defaultValue={
                        workspaceBaseCurrency
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    >
                      {OPERATION_CURRENCIES.map(
                        (currency) => (
                          <option
                            key={currency}
                            value={currency}
                          >
                            {currency}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reportedMarketValueBase"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Value in{" "}
                    {workspaceBaseCurrency}
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="reportedMarketValueBase"
                    name="marketValueBase"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Optional ${workspaceBaseCurrency} equivalent`}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    Leave empty for a{" "}
                    {workspaceBaseCurrency} value.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="reportedNotes"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Notes
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="reportedNotes"
                    name="notes"
                    type="text"
                    maxLength={500}
                    placeholder="Monthly mojeppk.pl reading"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Save reported balance
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                A reported-balance instrument and
                an active account are required.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Units valuation
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use for assets with a known quantity,
              including manually valued government bond positions.
            </p>

            {canEdit &&
            sortedAccounts.length > 0 &&
            unitsInstruments.length > 0 ? (
              <form
                action={
                  upsertUnitsValuationSnapshot
                }
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="unitsSnapshotDate"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Snapshot date
                  </label>

                  <input
                    id="unitsSnapshotDate"
                    name="snapshotDate"
                    type="date"
                    required
                    defaultValue={defaultDate}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unitsAccountId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account
                  </label>

                  <select
                    id="unitsAccountId"
                    name="accountId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select account
                    </option>

                    {renderAccountOptions()}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="unitsInstrumentId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Instrument
                  </label>

                  <select
                    id="unitsInstrumentId"
                    name="instrumentId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select instrument
                    </option>

                    {unitsInstruments.map(
                      (instrument) => (
                        <option
                          key={instrument.id}
                          value={instrument.id}
                        >
                          {[
                            instrument.ticker,
                            instrument.name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="unitsQuantity"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Quantity
                    </label>

                    <input
                      id="unitsQuantity"
                      name="quantity"
                      type="number"
                      required
                      min="0.00000001"
                      step="0.00000001"
                      placeholder="400"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="unitsMarketValue"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Total market value
                    </label>

                    <input
                      id="unitsMarketValue"
                      name="marketValue"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="10000.00"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="unitsUnitPrice"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Unit price
                      <span className="ml-1 font-normal text-slate-500">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="unitsUnitPrice"
                      name="unitPrice"
                      type="number"
                      min="0"
                      step="0.00000001"
                      placeholder="Calculated automatically"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="unitsCurrency"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Currency
                    </label>

                    <select
                      id="unitsCurrency"
                      name="currency"
                      defaultValue={
                        workspaceBaseCurrency
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    >
                      {OPERATION_CURRENCIES.map(
                        (currency) => (
                          <option
                            key={currency}
                            value={currency}
                          >
                            {currency}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="unitsMarketValueBase"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Value in{" "}
                    {workspaceBaseCurrency}
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="unitsMarketValueBase"
                    name="marketValueBase"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Optional ${workspaceBaseCurrency} equivalent`}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unitsNotes"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Notes
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="unitsNotes"
                    name="notes"
                    type="text"
                    maxLength={500}
                    placeholder="Monthly government bond valuation"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Save units valuation
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                A units-based instrument and an
                active account are required.
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                Snapshot history
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                The one hundred most recent dated
                valuations.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {history.length}
            </span>
          </div>

          {history.length > 0 ? (
            <ul className="mt-6 divide-y divide-slate-200">
              {history.map((snapshot) => (
                <li
                  key={snapshot.snapshot_id}
                  className="py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {snapshot.instrument_ticker ||
                          snapshot.instrument_name}
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        {snapshot.instrument_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {snapshot.snapshot_date} ·{" "}
                        {[
                          snapshot.owner_name,
                          snapshot.provider_name,
                          snapshot.account_name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>

                      {snapshot.quantity !== null && (
                        <p className="mt-1 text-xs text-slate-500">
                          Quantity:{" "}
                          {formatQuantity(
                            Number(
                              snapshot.quantity,
                            ),
                          )}
                          {snapshot.unit_price !==
                            null &&
                            ` · Unit price: ${formatAmount(
                              Number(
                                snapshot.unit_price,
                              ),
                            )} ${
                              snapshot.currency
                            }`}
                        </p>
                      )}

                      {snapshot.notes && (
                        <p className="mt-1 text-xs text-slate-500">
                          {snapshot.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-lg font-semibold">
                        {formatAmount(
                          Number(
                            snapshot.market_value,
                          ),
                        )}{" "}
                        {snapshot.currency}
                      </p>

                      {snapshot.market_value_base !==
                        null &&
                        snapshot.currency !==
                          workspaceBaseCurrency && (
                          <p className="mt-1 text-xs text-slate-500">
                            {formatAmount(
                              Number(
                                snapshot.market_value_base,
                              ),
                            )}{" "}
                            {workspaceBaseCurrency}
                          </p>
                        )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <p className="font-medium">
                No valuation snapshots
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Add the first PPK or bond valuation
                using one of the forms above.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}