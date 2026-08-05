import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import { createCashOperation } from "./actions";
import { getDateInTimeZone } from "./form-helpers";
import {
  CASH_OPERATION_TYPE_LABELS,
  CASH_OPERATION_TYPES,
  OPERATION_CURRENCIES,
  OPERATION_TYPE_LABELS,
} from "./operation-options";

type OperationsPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type OperationEntrySummary = Pick<
  Database["public"]["Tables"]["portfolio_operation_entries"]["Row"],
  | "id"
  | "operation_id"
  | "sequence_no"
  | "account_id"
  | "cash_delta"
  | "currency"
  | "component"
>;

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOperationTime(
  value: string | null,
  timeZone: string,
): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function OperationsPage({
  searchParams,
}: OperationsPageProps) {
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
    operationsResult,
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
      )
      .order("sort_order", {
        ascending: true,
      }),

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
      ),

    supabase
      .from("portfolio_operations")
      .select(
        "id, operation_date, executed_at, operation_type, status, source, description, created_at",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .order("operation_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      })
      .limit(50),
  ]);

  const workspace = workspaceResult.data;
  const owners = ownersResult.data ?? [];
  const providers = providersResult.data ?? [];
  const accounts = accountsResult.data ?? [];
  const operations =
    operationsResult.data ?? [];

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

  if (operationsResult.error) {
    console.error(
      "Operations query failed:",
      operationsResult.error,
    );
  }

  const operationIds = operations.map(
    (operation) => operation.id,
  );

  let operationEntries:
    OperationEntrySummary[] = [];

  if (operationIds.length > 0) {
    const { data, error } = await supabase
      .from("portfolio_operation_entries")
      .select(
        "id, operation_id, sequence_no, account_id, cash_delta, currency, component",
      )
      .in("operation_id", operationIds)
      .order("operation_id", {
        ascending: true,
      })
      .order("sequence_no", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Operation entries query failed:",
        error,
      );
    } else {
      operationEntries = data ?? [];
    }
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

  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      account,
    ]),
  );

  const activeAccounts = accounts
    .filter((account) => account.is_active)
    .sort((first, second) => {
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
    });

  const entriesByOperation = new Map<
    string,
    OperationEntrySummary[]
  >();

  for (const entry of operationEntries) {
    const entries =
      entriesByOperation.get(
        entry.operation_id,
      ) ?? [];

    entries.push(entry);

    entriesByOperation.set(
      entry.operation_id,
      entries,
    );
  }

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const workspaceTimeZone =
    workspace?.timezone ?? "Europe/Warsaw";

  const today = getDateInTimeZone(
    workspaceTimeZone,
  );

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
            Portfolio data
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Operations
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <nav className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/portfolio/operations/internal-transfer"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Internal transfer
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Move cash between accounts using the
              same currency.
            </p>
          </Link>

          <Link
            href="/portfolio/operations/currency-exchange"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-medium">
              Currency exchange
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Record outgoing and incoming amounts
              in different currencies.
            </p>
          </Link>
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Recent operations
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The list shows the fifty most
                  recent posted, draft or voided
                  portfolio events.
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {operations.length}
              </span>
            </div>

            {operations.length > 0 ? (
              <ul className="mt-6 divide-y divide-slate-200">
                {operations.map((operation) => {
                  const entries =
                    entriesByOperation.get(
                      operation.id,
                    ) ?? [];

                  const operationTime =
                    formatOperationTime(
                      operation.executed_at,
                      workspaceTimeZone,
                    );

                  return (
                    <li
                      key={operation.id}
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {
                              OPERATION_TYPE_LABELS[
                                operation
                                  .operation_type
                              ]
                            }
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {operation.operation_date}
                            {operationTime
                              ? ` · ${operationTime}`
                              : ""}
                            {operation.description
                              ? ` · ${operation.description}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {operation.status}
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {operation.source}
                          </span>
                        </div>
                      </div>

                      {entries.length > 0 && (
                        <ul className="mt-4 space-y-2">
                          {entries.map((entry) => {
                            const account =
                              accountMap.get(
                                entry.account_id,
                              );

                            const owner = account
                              ? ownerMap.get(
                                  account.owner_id,
                                )
                              : undefined;

                            const provider = account
                              ? providerMap.get(
                                  account.provider_id,
                                )
                              : undefined;

                            const cashDelta =
                              Number(
                                entry.cash_delta,
                              );

                            const accountDescription =
                              account
                                ? [
                                    owner?.display_name,
                                    provider?.name,
                                    account.name,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : "Unknown account";

                            return (
                              <li
                                key={entry.id}
                                className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <p className="text-sm text-slate-600">
                                  {
                                    accountDescription
                                  }
                                </p>

                                <span
                                  className={
                                    cashDelta >= 0
                                      ? "w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                                      : "w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                                  }
                                >
                                  {cashDelta >= 0
                                    ? "+"
                                    : ""}
                                  {formatAmount(
                                    cashDelta,
                                  )}{" "}
                                  {entry.currency}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">
                  No operations yet
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add the first real portfolio
                  operation using the form.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Add cash operation
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cash operations affect an account
              balance without changing an instrument
              quantity.
            </p>

            {success === "operation_added" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                The operation was posted.
              </p>
            )}

            {errorCode && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                The operation could not be posted.
                Check the selected values and server
                log.
              </p>
            )}

            {canEdit &&
            activeAccounts.length > 0 ? (
              <form
                action={createCashOperation}
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
                      defaultValue={today}
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
                    htmlFor="operationType"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Operation type
                  </label>

                  <select
                    id="operationType"
                    name="operationType"
                    defaultValue="deposit"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {CASH_OPERATION_TYPES.map(
                      (operationType) => (
                        <option
                          key={operationType}
                          value={operationType}
                        >
                          {
                            CASH_OPERATION_TYPE_LABELS[
                              operationType
                            ]
                          }
                        </option>
                      ),
                    )}
                  </select>
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

                    {activeAccounts.map(
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
                            {[
                              owner?.display_name,
                              provider?.name,
                              account.name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </option>
                        );
                      },
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
                    placeholder="Weekly portfolio contribution"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Post operation
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Operation creation is unavailable.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}