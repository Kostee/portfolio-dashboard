import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createFundingRoute } from "./actions";
import {
  getDateInTimeZone,
} from "../form-helpers";
import {
  OPERATION_CURRENCIES,
} from "../operation-options";

type FundingRoutePageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

const ERROR_MESSAGES: Record<
  string,
  string
> = {
  owner_required:
    "Select the owner.",
  contribution_date_invalid:
    "Enter a valid contribution date.",
  contribution_time_invalid:
    "Enter a valid contribution time.",
  contribution_amount_invalid:
    "Enter a valid contribution amount.",
  exchange_channel_required:
    "Select an exchange channel.",
  exchange_channel_invalid:
    "The selected exchange channel is unavailable.",
  exchange_amount_invalid:
    "Enter valid exchange amounts.",
  exchange_fee_invalid:
    "Enter a valid exchange fee.",
  exchange_currency_invalid:
    "Select a valid destination currency.",
  same_currency:
    "The exchange must use two different currencies.",
  exchange_net_mismatch:
    "The amount leaving the exchange channel must equal the exchanged amount minus the exchange fee.",
  intermediate_channel_invalid:
    "The selected intermediate channel is unavailable.",
  destination_account_required:
    "Select the destination portfolio account.",
  destination_account_invalid:
    "The selected destination account is unavailable.",
  destination_owner_mismatch:
    "The destination account must belong to the selected owner.",
  destination_currency_mismatch:
    "The destination account currency does not match the exchanged currency.",
  arrival_date_invalid:
    "Enter a valid arrival date.",
  arrival_time_invalid:
    "Enter a valid arrival time.",
  destination_amount_invalid:
    "Enter the amount that actually reached the destination account.",
  workspace_not_found:
    "Portfolio workspace could not be loaded.",
  forbidden:
    "You cannot edit this workspace.",
  creation_failed:
    "The funding route could not be saved.",
  deposit_date_invalid:
    "Enter a valid provider deposit date.",
  deposit_time_invalid:
    "Enter a valid provider deposit time.",
  deposit_before_arrival:
    "The provider deposit cannot be earlier than the actual arrival.",
};

export default async function FundingRoutePage({
  searchParams,
}: FundingRoutePageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const {
    error: errorCode,
    success,
  } = await searchParams;

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("workspace_members")
    .select(
      "workspace_id, role",
    )
    .order(
      "created_at",
      { ascending: true },
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    redirect("/portfolio");
  }

  const [
    workspaceResult,
    ownersResult,
    providersResult,
    accountsResult,
    channelsResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "name, base_currency, timezone",
      )
      .eq(
        "id",
        membership.workspace_id,
      )
      .single(),

    supabase
      .from("owners")
      .select(
        "id, display_name, sort_order",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order(
        "sort_order",
        { ascending: true },
      ),

    supabase
      .from("providers")
      .select(
        "id, name",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, provider_id, name, base_currency, is_active",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "is_active",
        true,
      ),

    supabase
      .from("exchange_channels")
      .select(
        "id, name",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order(
        "name",
        { ascending: true },
      ),
  ]);

  const workspace =
    workspaceResult.data;

  const owners =
    ownersResult.data ?? [];

  const providers =
    providersResult.data ?? [];

  const accounts =
    accountsResult.data ?? [];

  const channels =
    channelsResult.data ?? [];

  if (!workspace) {
    redirect("/portfolio");
  }

  const providerMap = new Map(
    providers.map((provider) => [
      provider.id,
      provider.name,
    ]),
  );

  const ownerMap = new Map(
    owners.map((owner) => [
      owner.id,
      owner.display_name,
    ]),
  );

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const today =
    getDateInTimeZone(
      workspace.timezone,
    );

  const nonBaseCurrencies =
    OPERATION_CURRENCIES.filter(
      (currency) =>
        currency !==
        workspace.base_currency,
    );

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
            External capital
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Funding route
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Record one external contribution
            while preserving its route through
            services such as Walutomat or
            Revolut before the money reaches
            a tracked portfolio account.
          </p>
        </header>

        {success && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Funding route saved successfully.
            The destination cash deposit was
            posted automatically.
          </p>
        )}

        {errorCode && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {ERROR_MESSAGES[
              errorCode
            ] ??
              "The funding route could not be saved."}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form
            action={createFundingRoute}
            className="space-y-8"
          >
            <div>
              <h2 className="text-lg font-semibold">
                1. External contribution
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                This is the only amount that
                increases cumulative
                contributions and enters XIRR
                as new capital.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="ownerId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Owner
                  </label>

                  <select
                    id="ownerId"
                    name="ownerId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Select owner
                    </option>

                    {owners.map(
                      (owner) => (
                        <option
                          key={owner.id}
                          value={owner.id}
                        >
                          {
                            owner.display_name
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="contributionDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Contribution date
                    </label>

                    <input
                      id="contributionDate"
                      name="contributionDate"
                      type="date"
                      required
                      defaultValue={today}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contributionTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Contribution time
                    </label>

                    <input
                      id="contributionTime"
                      name="contributionTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      {workspace.timezone}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contributionAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Contribution amount (
                    {
                      workspace.base_currency
                    }
                    )
                  </label>

                  <input
                    id="contributionAmount"
                    name="contributionAmount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="240.00"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <h2 className="text-lg font-semibold">
                2. Currency exchange
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="exchangeChannelId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Exchange channel
                  </label>

                  <select
                    id="exchangeChannelId"
                    name="exchangeChannelId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Select channel
                    </option>

                    {channels.map(
                      (channel) => (
                        <option
                          key={channel.id}
                          value={channel.id}
                        >
                          {channel.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Source currency is the
                  workspace base currency:{" "}
                  <strong>
                    {
                      workspace.base_currency
                    }
                  </strong>
                  . Source amount is the
                  contribution entered above.
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="exchangeToAmount"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Amount received before fee
                    </label>

                    <input
                      id="exchangeToAmount"
                      name="exchangeToAmount"
                      type="number"
                      min="0.00000001"
                      step="0.00000001"
                      required
                      placeholder="55.82"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="exchangeToCurrency"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Currency received
                    </label>

                    <select
                      id="exchangeToCurrency"
                      name="exchangeToCurrency"
                      required
                      defaultValue=""
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option
                        value=""
                        disabled
                      >
                        Select currency
                      </option>

                      {nonBaseCurrencies.map(
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
                    htmlFor="exchangeFeeAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Exchange fee
                  </label>

                  <input
                    id="exchangeFeeAmount"
                    name="exchangeFeeAmount"
                    type="number"
                    min="0"
                    step="0.00000001"
                    placeholder="0.12"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />

                  <p className="mt-1 text-xs text-slate-500">
                    Leave blank when there
                    was no separate fee.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="transferAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Amount leaving exchange
                    channel after fee
                  </label>

                  <input
                    id="transferAmount"
                    name="transferAmount"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    required
                    placeholder="55.70"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <h2 className="text-lg font-semibold">
                3. Route to portfolio
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="intermediateChannelId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Intermediate channel
                  </label>

                  <select
                    id="intermediateChannelId"
                    name="intermediateChannelId"
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">
                      None — direct transfer
                    </option>

                    {channels.map(
                      (channel) => (
                        <option
                          key={channel.id}
                          value={channel.id}
                        >
                          {channel.name}
                        </option>
                      ),
                    )}
                  </select>

                  <p className="mt-1 text-xs text-slate-500">
                    Example: Revolut between
                    Walutomat and Bitvavo.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="destinationAccountId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Destination portfolio
                    account
                  </label>

                  <select
                    id="destinationAccountId"
                    name="destinationAccountId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Select account
                    </option>

                    {accounts.map(
                      (account) => {
                        const owner =
                          ownerMap.get(
                            account.owner_id,
                          );

                        const provider =
                          providerMap.get(
                            account.provider_id,
                          );

                        return (
                          <option
                            key={account.id}
                            value={account.id}
                          >
                            {owner ??
                              "Owner"}{" "}
                            ·{" "}
                            {provider ??
                              "Provider"}{" "}
                            · {account.name} ·{" "}
                            {
                              account.base_currency
                            }
                          </option>
                        );
                      },
                    )}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="arrivalDate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Arrival date
                    </label>

                    <input
                      id="arrivalDate"
                      name="arrivalDate"
                      type="date"
                      required
                      defaultValue={today}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="arrivalTime"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Arrival time
                    </label>

                    <input
                      id="arrivalTime"
                      name="arrivalTime"
                      type="time"
                      step={60}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="destinationAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Amount actually received
                  </label>

                  <input
                    id="destinationAmount"
                    name="destinationAmount"
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    required
                    placeholder="55.70"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-medium">
                        Provider deposit timestamp
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        The timestamp shown by the destination
                        provider. It may be slightly later than
                        the actual arrival above.
                    </p>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                        <label
                            htmlFor="depositDate"
                            className="block text-sm font-medium text-slate-700"
                        >
                            Deposit date
                        </label>

                        <input
                            id="depositDate"
                            name="depositDate"
                            type="date"
                            required
                            defaultValue={today}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        </div>

                        <div>
                        <label
                            htmlFor="depositTime"
                            className="block text-sm font-medium text-slate-700"
                        >
                            Deposit time
                        </label>

                        <input
                            id="depositTime"
                            name="depositTime"
                            type="time"
                            step={60}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        </div>
                    </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <h2 className="text-lg font-semibold">
                4. Description
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>

                  <input
                    id="description"
                    name="description"
                    type="text"
                    maxLength={250}
                    placeholder="BTC funding via Walutomat → Revolut → Bitvavo"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Notes
                  </label>

                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canEdit}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Post funding route
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}