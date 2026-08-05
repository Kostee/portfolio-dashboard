import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getDateInTimeZone } from "../form-helpers";
import { OPERATION_CURRENCIES } from "../operation-options";
import { createInternalTransfer } from "./actions";

type InternalTransferPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function InternalTransferPage({
  searchParams,
}: InternalTransferPageProps) {
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
    workspaceResult,
    ownersResult,
    providersResult,
    accountsResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, timezone")
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
        "id, owner_id, provider_id, name, base_currency, is_active",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("is_active", true),
  ]);

  const workspace = workspaceResult.data;
  const owners = ownersResult.data ?? [];
  const providers = providersResult.data ?? [];
  const accounts = accountsResult.data ?? [];

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
      const firstOwner = ownerMap.get(
        first.owner_id,
      );

      const secondOwner = ownerMap.get(
        second.owner_id,
      );

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

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const workspaceTimeZone =
    workspace?.timezone ?? "Europe/Warsaw";

  const defaultDate = getDateInTimeZone(
    workspaceTimeZone,
  );

  const renderAccountLabel = (
    account: (typeof sortedAccounts)[number],
  ) =>
    [
      ownerMap.get(account.owner_id)
        ?.display_name,
      providerMap.get(account.provider_id)
        ?.name,
      account.name,
      account.base_currency,
    ]
      .filter(Boolean)
      .join(" · ");

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
            Internal transfer
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Move cash between accounts
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Both accounts must use the same currency.
            The operation creates equal and opposite
            ledger entries.
          </p>

          {errorCode && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              The transfer could not be posted.
              Check the accounts, date, time,
              currency and amount.
            </p>
          )}

          {canEdit &&
          sortedAccounts.length >= 2 ? (
            <form
              action={createInternalTransfer}
              className="mt-6 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
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

                  {sortedAccounts.map(
                    (account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {renderAccountLabel(
                          account,
                        )}
                      </option>
                    ),
                  )}
                </select>
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
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>
                    Select destination account
                  </option>

                  {sortedAccounts.map(
                    (account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {renderAccountLabel(
                          account,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="amount"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Amount
                  </label>

                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="500.00"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="currency"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Currency
                  </label>

                  <select
                    id="currency"
                    name="currency"
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
                </div>
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
                  placeholder="Transfer to IKE"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Post internal transfer
              </button>
            </form>
          ) : (
            <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              At least two editable accounts are
              required.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}