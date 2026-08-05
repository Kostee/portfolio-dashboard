import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getDateInTimeZone } from "../form-helpers";
import { OPERATION_CURRENCIES } from "../operation-options";
import { createCurrencyExchange } from "./actions";

type CurrencyExchangePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function CurrencyExchangePage({
  searchParams,
}: CurrencyExchangePageProps) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { error: errorCode } = await searchParams;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/portfolio");
  }

  const [
    workspaceResult,
    ownersResult,
    providersResult,
    accountsResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, timezone, base_currency")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("owners")
      .select("id, display_name, sort_order")
      .eq("workspace_id", membership.workspace_id),

    supabase
      .from("providers")
      .select("id, name")
      .eq("workspace_id", membership.workspace_id),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, provider_id, name, base_currency",
      )
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true),
  ]);

  const workspace = workspaceResult.data;
  const owners = ownersResult.data ?? [];
  const providers = providersResult.data ?? [];
  const accounts = accountsResult.data ?? [];

  const ownerMap = new Map(
    owners.map((owner) => [owner.id, owner]),
  );

  const providerMap = new Map(
    providers.map((provider) => [
      provider.id,
      provider,
    ]),
  );

  const sortedAccounts = [...accounts].sort(
    (first, second) => {
      const ownerOrderDifference =
        (ownerMap.get(first.owner_id)?.sort_order ?? 999) -
        (ownerMap.get(second.owner_id)?.sort_order ?? 999);

      if (ownerOrderDifference !== 0) {
        return ownerOrderDifference;
      }

      return first.name.localeCompare(second.name);
    },
  );

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const defaultDate = getDateInTimeZone(
    workspace?.timezone ?? "Europe/Warsaw",
  );

  const renderAccountOptions = () =>
    sortedAccounts.map((account) => (
      <option key={account.id} value={account.id}>
        {[
          ownerMap.get(account.owner_id)?.display_name,
          providerMap.get(account.provider_id)?.name,
          account.name,
          account.base_currency,
        ]
          .filter(Boolean)
          .join(" · ")}
      </option>
    ));

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
            Cash movement
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Currency exchange
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Exchange cash between accounts
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            The operation records the outgoing and incoming
            amounts as two balanced ledger entries.
          </p>

          {errorCode && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              The exchange could not be posted. Check the
              accounts, currencies and amounts.
            </p>
          )}

          {canEdit && sortedAccounts.length >= 2 ? (
            <form
              action={createCurrencyExchange}
              className="mt-6 space-y-4"
            >
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
                  htmlFor="fromAccountId"
                  className="block text-sm font-medium text-slate-700"
                >
                  Source account
                </label>

                <select
                  id="fromAccountId"
                  name="fromAccountId"
                  required
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>
                    Select source account
                  </option>
                  {renderAccountOptions()}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="fromAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Source amount
                  </label>

                  <input
                    id="fromAmount"
                    name="fromAmount"
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
                    htmlFor="fromCurrency"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Source currency
                  </label>

                  <select
                    id="fromCurrency"
                    name="fromCurrency"
                    defaultValue="PLN"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {OPERATION_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="toAccountId"
                  className="block text-sm font-medium text-slate-700"
                >
                  Destination account
                </label>

                <select
                  id="toAccountId"
                  name="toAccountId"
                  required
                  defaultValue=""
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Select destination account
                  </option>
                  {renderAccountOptions()}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="toAmount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Destination amount
                  </label>

                  <input
                    id="toAmount"
                    name="toAmount"
                    type="number"
                    required
                    min="0.00000001"
                    step="0.00000001"
                    placeholder="133.01"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="toCurrency"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Destination currency
                  </label>

                  <select
                    id="toCurrency"
                    name="toCurrency"
                    defaultValue="USD"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {OPERATION_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="baseValue"
                  className="block text-sm font-medium text-slate-700"
                >
                  Base-currency value
                </label>

                <input
                  id="baseValue"
                  name="baseValue"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={`Optional — ${workspace?.base_currency ?? "PLN"}`}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Required only when neither account uses{" "}
                  {workspace?.base_currency ?? "PLN"}.
                </p>
              </div>

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
                  placeholder="PLN to USD conversion"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Post currency exchange
              </button>
            </form>
          ) : (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              At least two editable accounts are required.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}