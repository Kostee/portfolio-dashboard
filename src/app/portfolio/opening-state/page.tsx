import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { OPERATION_CURRENCIES } from "../operations/operation-options";
import {
  createOpeningCashBalance,
  createOpeningReportedBalance,
  createOpeningUnitsPosition,
} from "./actions";

type OpeningStatePageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

const DEFAULT_OPENING_DATE = "2026-06-13";

const ERROR_MESSAGES: Record<
  string,
  string
> = {
  workspace_not_found:
    "The portfolio workspace is unavailable.",
  forbidden:
    "You cannot create opening entries in this workspace.",
  date_required:
    "Enter a valid opening date.",
  time_invalid:
    "Enter a valid opening time.",
  units_account_required:
    "Select an account for the opening position.",
  units_instrument_required:
    "Select an instrument for the opening position.",
  quantity_required:
    "Enter an opening quantity greater than zero.",
  invalid_units_instrument:
    "The selected instrument is not tracked using units.",
  units_creation_failed:
    "The opening units position could not be created.",
  cash_account_required:
    "Select an account for the opening cash balance.",
  cash_amount_required:
    "Enter an opening cash balance greater than zero.",
  cash_base_value_invalid:
    "Enter a valid base-currency cash value or leave it empty.",
  cash_creation_failed:
    "The opening cash balance could not be created.",
  reported_account_required:
    "Select an account for the reported balance.",
  reported_instrument_required:
    "Select a balance-tracked instrument.",
  reported_value_required:
    "Enter a reported balance greater than zero.",
  reported_base_value_invalid:
    "Enter a valid base-currency value or leave it empty.",
  invalid_balance_instrument:
    "The selected instrument is not tracked as a reported balance.",
  reported_creation_failed:
    "The opening reported balance could not be created.",
  currency_required:
    "Select a supported currency.",
  currency_mismatch:
    "The currency must match the selected account currency.",
  invalid_account:
    "The selected account is unavailable.",
  invalid_instrument:
    "The selected instrument is unavailable.",
};

const SUCCESS_MESSAGES: Record<
  string,
  string
> = {
  units_added:
    "The opening units position was added.",
  cash_added:
    "The opening cash balance was added.",
  reported_added:
    "The opening reported balance was added.",
};

export default async function OpeningStatePage({
  searchParams,
}: OpeningStatePageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode, success } =
    await searchParams;

  const { data: membership, error: membershipError } =
    await supabase
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
        "id, name, ticker, exchange, default_currency, tracking_mode",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),
  ]);

  const workspace = workspaceResult.data;
  const owners = ownersResult.data ?? [];
  const providers =
    providersResult.data ?? [];
  const accounts = accountsResult.data ?? [];
  const instruments =
    instrumentsResult.data ?? [];

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

  const unitsInstruments = instruments
    .filter(
      (instrument) =>
        instrument.tracking_mode === "units",
    )
    .sort((first, second) =>
      first.name.localeCompare(second.name),
    );

  const balanceInstruments = instruments
    .filter(
      (instrument) =>
        instrument.tracking_mode === "balance",
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

  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ??
      "The opening entry could not be created."
    : null;

  const successMessage = success
    ? SUCCESS_MESSAGES[success] ?? null
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
            href="/portfolio/operations"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Operations
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Portfolio initialization
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Opening state
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
          Opening entries describe assets and cash
          already held when detailed operation
          tracking begins. They are not purchases,
          deposits or external XIRR cash flows.
        </div>

        {successMessage && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            {successMessage}
          </p>
        )}

        {errorMessage && (
          <p className="mt-6 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Units position
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Record shares or units already held on
              the opening date.
            </p>

            {canEdit &&
            sortedAccounts.length > 0 &&
            unitsInstruments.length > 0 ? (
              <form
                action={createOpeningUnitsPosition}
                className="mt-6 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label
                      htmlFor="unitsOperationDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening date
                    </label>

                    <input
                      id="unitsOperationDate"
                      name="operationDate"
                      type="date"
                      required
                      defaultValue={
                        DEFAULT_OPENING_DATE
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="unitsOperationTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening time
                      <span className="ml-1 font-normal text-slate-500">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="unitsOperationTime"
                      name="operationTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      {workspaceTimeZone}
                    </p>
                  </div>
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
                            instrument.exchange,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="unitsQuantity"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Opening quantity
                  </label>

                  <input
                    id="unitsQuantity"
                    name="quantity"
                    type="number"
                    required
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="5"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unitsDescription"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="unitsDescription"
                    name="description"
                    type="text"
                    maxLength={250}
                    placeholder="Opening position"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add units position
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                An active account and a units-based
                instrument are required.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Cash balance
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Record cash already available on an
              account when tracking begins.
            </p>

            {canEdit &&
            sortedAccounts.length > 0 ? (
              <form
                action={createOpeningCashBalance}
                className="mt-6 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label
                      htmlFor="cashOperationDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening date
                    </label>

                    <input
                      id="cashOperationDate"
                      name="operationDate"
                      type="date"
                      required
                      defaultValue={
                        DEFAULT_OPENING_DATE
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cashOperationTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening time
                      <span className="ml-1 font-normal text-slate-500">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="cashOperationTime"
                      name="operationTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      {workspaceTimeZone}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cashAccountId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account
                  </label>

                  <select
                    id="cashAccountId"
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

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label
                      htmlFor="cashAmount"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening cash balance
                    </label>

                    <input
                      id="cashAmount"
                      name="amount"
                      type="number"
                      required
                      min="0.00000001"
                      step="0.00000001"
                      placeholder="500.00"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cashCurrency"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Currency
                    </label>

                    <select
                      id="cashCurrency"
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
                    htmlFor="cashBaseValue"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Value in{" "}
                    {workspaceBaseCurrency}
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="cashBaseValue"
                    name="baseValue"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    placeholder={`Optional ${workspaceBaseCurrency} equivalent`}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Leave empty for a{" "}
                    {workspaceBaseCurrency} account.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="cashDescription"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="cashDescription"
                    name="description"
                    type="text"
                    maxLength={250}
                    placeholder="Opening cash balance"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add cash balance
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                An active account is required.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Reported balance
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Record the opening value of an asset
              tracked as a total reported balance.
            </p>

            {canEdit &&
            sortedAccounts.length > 0 &&
            balanceInstruments.length > 0 ? (
              <form
                action={
                  createOpeningReportedBalance
                }
                className="mt-6 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label
                      htmlFor="reportedOperationDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening date
                    </label>

                    <input
                      id="reportedOperationDate"
                      name="operationDate"
                      type="date"
                      required
                      defaultValue={
                        DEFAULT_OPENING_DATE
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reportedOperationTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening time
                      <span className="ml-1 font-normal text-slate-500">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="reportedOperationTime"
                      name="operationTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      {workspaceTimeZone}
                    </p>
                  </div>
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
                    Balance-tracked instrument
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

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label
                      htmlFor="reportedValueAmount"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Opening reported value
                    </label>

                    <input
                      id="reportedValueAmount"
                      name="valueAmount"
                      type="number"
                      required
                      min="0.00000001"
                      step="0.00000001"
                      placeholder="10000.00"
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
                    htmlFor="reportedBaseValue"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Value in{" "}
                    {workspaceBaseCurrency}
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="reportedBaseValue"
                    name="baseValue"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    placeholder={`Optional ${workspaceBaseCurrency} equivalent`}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Leave empty when the value is
                    already expressed in{" "}
                    {workspaceBaseCurrency}.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="reportedDescription"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="reportedDescription"
                    name="description"
                    type="text"
                    maxLength={250}
                    placeholder="Opening reported balance"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add reported balance
                </button>
              </form>
            ) : (
              <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                Create an active instrument using
                the Reported balance tracking mode
                before adding this type of opening
                entry.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}