import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  ACCOUNT_CURRENCIES,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
} from "./account-options";
import { createAccount } from "./actions";

type AccountsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function AccountsPage({
  searchParams,
}: AccountsPageProps) {
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
    { data: owners, error: ownersError },
    { data: providers, error: providersError },
    { data: accounts, error: accountsError },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("owners")
      .select("id, display_name, sort_order")
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("providers")
      .select("id, name")
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, provider_id, name, account_type, base_currency, is_active",
      )
      .eq("workspace_id", membership.workspace_id),
  ]);

  if (ownersError) {
    console.error("Owners query failed:", ownersError);
  }

  if (providersError) {
    console.error("Providers query failed:", providersError);
  }

  if (accountsError) {
    console.error("Accounts query failed:", accountsError);
  }

  const ownerMap = new Map(
    (owners ?? []).map((owner) => [owner.id, owner]),
  );

  const providerMap = new Map(
    (providers ?? []).map((provider) => [
      provider.id,
      provider,
    ]),
  );

  const sortedAccounts = [...(accounts ?? [])].sort(
    (first, second) => {
      const firstOwner = ownerMap.get(first.owner_id);
      const secondOwner = ownerMap.get(second.owner_id);

      const ownerOrderDifference =
        (firstOwner?.sort_order ?? 999) -
        (secondOwner?.sort_order ?? 999);

      if (ownerOrderDifference !== 0) {
        return ownerOrderDifference;
      }

      return first.name.localeCompare(second.name);
    },
  );

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const hasConfigurationOptions =
    (owners?.length ?? 0) > 0 &&
    (providers?.length ?? 0) > 0;

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
            Accounts
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Current accounts
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Accounts connect an owner with a financial
                  provider, account type and base currency.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {sortedAccounts.length}
              </span>
            </div>

            {sortedAccounts.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {sortedAccounts.map((account) => {
                  const owner = ownerMap.get(account.owner_id);
                  const provider = providerMap.get(
                    account.provider_id,
                  );

                  return (
                    <li
                      key={account.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {account.name}
                          </p>

                          <p className="mt-1 text-sm text-slate-600">
                            {owner?.display_name ??
                              "Unknown owner"}
                            {" · "}
                            {provider?.name ??
                              "Unknown provider"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {
                              ACCOUNT_TYPE_LABELS[
                                account.account_type
                              ]
                            }
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {account.base_currency}
                          </span>

                          <span
                            className={
                              account.is_active
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                            }
                          >
                            {account.is_active
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
                <p className="font-medium">No accounts yet</p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add the first account after selecting its
                  owner, provider, type and base currency.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add account
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Keep account names short. The owner and provider
              are displayed separately.
            </p>

            {success === "account_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The account was added.
              </p>
            )}

            {errorCode === "name_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Enter the account name.
              </p>
            )}

            {errorCode === "owner_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select an account owner.
              </p>
            )}

            {errorCode === "provider_required" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select a provider.
              </p>
            )}

            {(errorCode === "type_required" ||
              errorCode === "currency_required") && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Select a valid account type and currency.
              </p>
            )}

            {(errorCode === "invalid_owner" ||
              errorCode === "invalid_provider") && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The selected owner or provider is unavailable.
              </p>
            )}

            {errorCode === "duplicate_account" && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                This account already exists for the selected
                owner and provider.
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
                The account could not be added. Check the server
                log.
              </p>
            )}

            {!hasConfigurationOptions && (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Add at least one owner and one provider before
                creating accounts.
              </p>
            )}

            {canEdit && hasConfigurationOptions ? (
              <form
                action={createAccount}
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="accountName"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account name
                  </label>

                  <input
                    id="accountName"
                    name="accountName"
                    type="text"
                    required
                    maxLength={150}
                    placeholder="PLN brokerage"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

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
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select owner
                    </option>

                    {(owners ?? []).map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="providerId"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Provider
                  </label>

                  <select
                    id="providerId"
                    name="providerId"
                    required
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="" disabled>
                      Select provider
                    </option>

                    {(providers ?? []).map((provider) => (
                      <option
                        key={provider.id}
                        value={provider.id}
                      >
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="accountType"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Account type
                  </label>

                  <select
                    id="accountType"
                    name="accountType"
                    defaultValue="brokerage_pln"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {ACCOUNT_TYPES.map((accountType) => (
                      <option
                        key={accountType}
                        value={accountType}
                      >
                        {ACCOUNT_TYPE_LABELS[accountType]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="baseCurrency"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Base currency
                  </label>

                  <select
                    id="baseCurrency"
                    name="baseCurrency"
                    defaultValue="PLN"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {ACCOUNT_CURRENCIES.map((currency) => (
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
                  Add account
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Account creation is unavailable.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}