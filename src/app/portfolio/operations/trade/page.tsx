import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getDateInTimeZone } from "../form-helpers";
import { OPERATION_CURRENCIES } from "../operation-options";
import { createTradeOperation } from "./actions";

type TradePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const ERROR_MESSAGES: Record<
  string,
  string
> = {
  account_required:
    "Select an account.",
  instrument_required:
    "Select an instrument.",
  date_required:
    "Enter a valid operation date.",
  time_invalid:
    "Enter a valid operation time.",
  type_required:
    "Select Buy or Sell.",
  quantity_required:
    "Enter a quantity greater than zero.",
  cash_amount_required:
    "Enter the actual cash amount.",
  currency_required:
    "Select a supported cash currency.",
  fee_invalid:
    "Enter a valid explicit fee or leave it empty.",
  tax_invalid:
    "Enter a valid explicit tax or leave it empty.",
  base_value_invalid:
    "Enter a valid base-currency value or leave it empty.",
  costs_too_high:
    "For a purchase, explicit fees and taxes must be lower than the total cash paid.",
  workspace_not_found:
    "The portfolio workspace is unavailable.",
  forbidden:
    "You cannot create operations in this workspace.",
  invalid_account:
    "The selected account is unavailable.",
  invalid_instrument:
    "The selected instrument is unavailable.",
  invalid_tracking_mode:
    "The selected instrument is not tracked using units.",
  currency_mismatch:
    "The cash currency must match the selected account currency.",
  creation_failed:
    "The trade could not be posted. Check the values and server log.",
};

export default async function TradePage({
  searchParams,
}: TradePageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode } =
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
      .eq("is_active", true)
      .eq("tracking_mode", "units"),
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

  const sortedInstruments =
    [...instruments].sort(
      (first, second) =>
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
      "The trade could not be posted."
    : null;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/operations"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Operations
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Portfolio transaction
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Buy or sell
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Record a trade
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter the actual amount paid from or
            received by the selected account. That
            cash movement is the source of truth.
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            For foreign instruments held in a PLN
            IKE or IKZE account, enter the actual PLN
            amount charged or credited by XTB. Do
            not enter the embedded currency
            conversion spread again as an explicit
            fee.
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          {canEdit &&
          sortedAccounts.length > 0 &&
          sortedInstruments.length > 0 ? (
            <form
              action={createTradeOperation}
              className="mt-6 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="operationDate"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Operation date
                  </label>

                  <input
                    id="operationDate"
                    name="operationDate"
                    type="date"
                    required
                    defaultValue={defaultDate}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="operationTime"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Operation time
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="operationTime"
                    name="operationTime"
                    type="time"
                    step={60}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    {workspaceTimeZone}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="operationType"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Operation type
                  </label>

                  <select
                    id="operationType"
                    name="operationType"
                    defaultValue="buy"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="buy">
                      Buy
                    </option>

                    <option value="sell">
                      Sell
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="accountId"
                  className="block text-sm font-medium text-slate-700"
                >
                  Account
                </label>

                <select
                  id="accountId"
                  name="accountId"
                  required
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>
                    Select account
                  </option>

                  {sortedAccounts.map(
                    (account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {[
                          ownerMap.get(
                            account.owner_id,
                          )?.display_name,
                          providerMap.get(
                            account.provider_id,
                          )?.name,
                          account.name,
                          account.base_currency,
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
                  htmlFor="instrumentId"
                  className="block text-sm font-medium text-slate-700"
                >
                  Instrument
                </label>

                <select
                  id="instrumentId"
                  name="instrumentId"
                  required
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>
                    Select instrument
                  </option>

                  {sortedInstruments.map(
                    (instrument) => (
                      <option
                        key={instrument.id}
                        value={instrument.id}
                      >
                        {[
                          instrument.ticker,
                          instrument.name,
                          instrument.exchange,
                          instrument.default_currency,
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
                    htmlFor="quantity"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Quantity
                  </label>

                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    required
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="0.20"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="actualCashAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Actual cash paid or received
                  </label>

                  <input
                    id="actualCashAmount"
                    name="actualCashAmount"
                    type="number"
                    required
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="615.38"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Enter a positive number. Buy
                    creates an outflow; Sell creates
                    an inflow.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cashCurrency"
                  className="block text-sm font-medium text-slate-700"
                >
                  Account cash currency
                </label>

                <select
                  id="cashCurrency"
                  name="cashCurrency"
                  defaultValue="PLN"
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

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This must match the currency of the
                  selected account, not necessarily
                  the instrument currency.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="feeAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Explicit fee
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="feeAmount"
                    name="feeAmount"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="Leave empty when included"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Use only for a separately shown
                    fee. Do not repeat an embedded FX
                    spread.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="taxAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Explicit tax
                    <span className="ml-1 font-normal text-slate-500">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="taxAmount"
                    name="taxAmount"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="Leave empty if none"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="baseValue"
                  className="block text-sm font-medium text-slate-700"
                >
                  Total value in{" "}
                  {workspaceBaseCurrency}
                  <span className="ml-1 font-normal text-slate-500">
                    (optional)
                  </span>
                </label>

                <input
                  id="baseValue"
                  name="baseValue"
                  type="number"
                  min="0.00000001"
                  step="0.00000001"
                  placeholder={`Optional ${workspaceBaseCurrency} equivalent`}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Calculated automatically when the
                  account is already denominated in{" "}
                  {workspaceBaseCurrency}. For a
                  foreign-currency account, it may be
                  left empty and supplemented later.
                </p>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-slate-700"
                >
                  Description
                  <span className="ml-1 font-normal text-slate-500">
                    (optional)
                  </span>
                </label>

                <input
                  id="description"
                  name="description"
                  type="text"
                  maxLength={250}
                  placeholder="Weekly semiconductor purchase"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Post trade
              </button>
            </form>
          ) : (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              At least one active account and one
              units-based instrument are required.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}