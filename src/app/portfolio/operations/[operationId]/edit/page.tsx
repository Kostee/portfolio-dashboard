import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { OPERATION_CURRENCIES } from "../../operation-options";
import { updateTradeOperation } from "./actions";

type EditTradePageProps = {
  params: Promise<{
    operationId: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

function formatOperationTimeForInput(
  value: string | null,
  timeZone: string,
): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(
    new Date(value),
  );
}

function formatInputNumber(
  value: number,
): string {
  return Number.isFinite(value)
    ? String(value)
    : "";
}

export default async function EditTradePage({
  params,
  searchParams,
}: EditTradePageProps) {
  const {
    operationId,
  } = await params;

  const {
    error: errorCode,
  } = await searchParams;

  const supabase =
    await createClient();

  const {
    data: claimsData,
  } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect(
      "/portfolio/login",
    );
  }

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
      {
        ascending: true,
      },
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    redirect(
      "/portfolio",
    );
  }

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  if (!canEdit) {
    redirect(
      "/portfolio/operations",
    );
  }

  const [
    workspaceResult,
    operationResult,
    entriesResult,
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
      .eq(
        "id",
        membership.workspace_id,
      )
      .single(),

    supabase
      .from("portfolio_operations")
      .select(
        "id, operation_date, executed_at, operation_type, status, source, description, funding_route_id",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "id",
        operationId,
      )
      .maybeSingle(),

    supabase
      .from("portfolio_operation_entries")
      .select(
        "id, sequence_no, account_id, instrument_id, component, quantity_delta, cash_delta, value_delta, currency, base_cash_delta",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "operation_id",
        operationId,
      )
      .order(
        "sequence_no",
        {
          ascending: true,
        },
      ),

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
        {
          ascending: true,
        },
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
      ),

    supabase
      .from("instruments")
      .select(
        "id, name, ticker, tracking_mode, is_active",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "tracking_mode",
        "units",
      ),
  ]);

  const workspace =
    workspaceResult.data;

  const operation =
    operationResult.data;

  const entries =
    entriesResult.data ?? [];

  const owners =
    ownersResult.data ?? [];

  const providers =
    providersResult.data ?? [];

  const accounts =
    accountsResult.data ?? [];

  const instruments =
    instrumentsResult.data ?? [];

  if (
    workspaceResult.error ||
    !workspace
  ) {
    redirect(
      "/portfolio/operations",
    );
  }

  if (
    operationResult.error ||
    !operation
  ) {
    redirect(
      "/portfolio/operations?error=operation_not_found",
    );
  }

  const isEditableTrade =
    operation.source === "manual" &&
    operation.status === "posted" &&
    (
      operation.operation_type === "buy" ||
      operation.operation_type === "sell"
    ) &&
    !operation.funding_route_id;

  const principalEntry =
    entries.find(
      (entry) =>
        entry.component ===
        "principal",
    );

  if (
    !isEditableTrade ||
    !principalEntry ||
    !principalEntry.instrument_id
  ) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/portfolio/operations"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Operations
          </Link>

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">
              Operation cannot be edited here
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              This editor is limited to posted manual buy and sell
              operations that are not linked to a Funding Route.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const ownerMap = new Map(
    owners.map(
      (owner) => [
        owner.id,
        owner,
      ],
    ),
  );

  const providerMap =
    new Map(
      providers.map(
        (provider) => [
          provider.id,
          provider,
        ],
      ),
    );

  const sortedAccounts = [
    ...accounts,
  ].sort(
    (
      first,
      second,
    ) => {
      const firstOwner =
        ownerMap.get(
          first.owner_id,
        );

      const secondOwner =
        ownerMap.get(
          second.owner_id,
        );

      const ownerDifference =
        (
          firstOwner?.sort_order ??
          999
        ) -
        (
          secondOwner?.sort_order ??
          999
        );

      if (
        ownerDifference !== 0
      ) {
        return ownerDifference;
      }

      return first.name.localeCompare(
        second.name,
      );
    },
  );

  const sortedInstruments = [
    ...instruments,
  ].sort(
    (
      first,
      second,
    ) =>
      (
        first.ticker ??
        first.name
      ).localeCompare(
        second.ticker ??
        second.name,
      ),
  );

  const feeEntry =
    entries.find(
      (entry) =>
        entry.component ===
        "fee",
    );

  const taxEntry =
    entries.find(
      (entry) =>
        entry.component ===
        "tax",
    );

  const quantity =
    Math.abs(
      Number(
        principalEntry.quantity_delta,
      ),
    );

  const actualCashAmount =
    Math.abs(
      entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          Number(
            entry.cash_delta,
          ),
        0,
      ),
    );

  const feeAmount =
    feeEntry
      ? Math.abs(
          Number(
            feeEntry.cash_delta,
          ),
        )
      : null;

  const taxAmount =
    taxEntry
      ? Math.abs(
          Number(
            taxEntry.cash_delta,
          ),
        )
      : null;

  const hasCompleteBaseCash =
    entries.every(
      (entry) =>
        entry.base_cash_delta !==
        null,
    );

  const baseValue =
    hasCompleteBaseCash
      ? Math.abs(
          entries.reduce(
            (
              total,
              entry,
            ) =>
              total +
              Number(
                entry.base_cash_delta,
              ),
            0,
          ),
        )
      : null;

  const workspaceTimeZone =
    workspace.timezone ??
    "Europe/Warsaw";

  const operationTime =
    formatOperationTimeForInput(
      operation.executed_at,
      workspaceTimeZone,
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
            Ledger correction
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Edit trade operation
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspace.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Saving keeps the same operation ID and atomically rebuilds
            this trade&apos;s principal, fee and tax ledger entries.
          </p>

          {errorCode && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              The operation could not be updated. Check the entered
              values and try again.
            </p>
          )}

          <form
            action={
              updateTradeOperation
            }
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="operationId"
              value={
                operation.id
              }
            />

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
                  defaultValue={
                    operation.operation_date
                  }
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
                  defaultValue={
                    operationTime
                  }
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
                defaultValue={
                  operation.operation_type
                }
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
                defaultValue={
                  principalEntry.account_id
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {sortedAccounts.map(
                  (account) => {
                    const owner =
                      ownerMap.get(
                        account.owner_id,
                      );

                    const provider =
                      providerMap.get(
                        account.provider_id,
                      );

                    const label = [
                      owner?.display_name,
                      provider?.name,
                      account.name,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {label}
                        {!account.is_active
                          ? " · inactive"
                          : ""}
                      </option>
                    );
                  },
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
                defaultValue={
                  principalEntry.instrument_id
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {sortedInstruments.map(
                  (instrument) => (
                    <option
                      key={
                        instrument.id
                      }
                      value={
                        instrument.id
                      }
                    >
                      {instrument.ticker
                        ? `${instrument.ticker} · ${instrument.name}`
                        : instrument.name}
                      {!instrument.is_active
                        ? " · inactive"
                        : ""}
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
                  min="0.0000000001"
                  step="any"
                  defaultValue={
                    formatInputNumber(
                      quantity,
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="actualCashAmount"
                  className="block text-sm font-medium text-slate-700"
                >
                  Actual cash amount
                </label>

                <input
                  id="actualCashAmount"
                  name="actualCashAmount"
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    actualCashAmount.toFixed(
                      2,
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="cashCurrency"
                  className="block text-sm font-medium text-slate-700"
                >
                  Currency
                </label>

                <select
                  id="cashCurrency"
                  name="cashCurrency"
                  defaultValue={
                    principalEntry.currency
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {OPERATION_CURRENCIES.map(
                    (currency) => (
                      <option
                        key={
                          currency
                        }
                        value={
                          currency
                        }
                      >
                        {currency}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="feeAmount"
                  className="block text-sm font-medium text-slate-700"
                >
                  Fee
                  <span className="ml-1 font-normal text-slate-500">
                    (optional)
                  </span>
                </label>

                <input
                  id="feeAmount"
                  name="feeAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    feeAmount === null
                      ? ""
                      : feeAmount.toFixed(
                          2,
                        )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="taxAmount"
                  className="block text-sm font-medium text-slate-700"
                >
                  Tax
                  <span className="ml-1 font-normal text-slate-500">
                    (optional)
                  </span>
                </label>

                <input
                  id="taxAmount"
                  name="taxAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    taxAmount === null
                      ? ""
                      : taxAmount.toFixed(
                          2,
                        )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="baseValue"
                className="block text-sm font-medium text-slate-700"
              >
                Base-currency value
                <span className="ml-1 font-normal text-slate-500">
                  (optional)
                </span>
              </label>

              <input
                id="baseValue"
                name="baseValue"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={
                  baseValue === null
                    ? ""
                    : baseValue.toFixed(
                        2,
                      )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <p className="mt-2 text-xs text-slate-500">
                {workspace.base_currency}
                {" "}equivalent of the total actual cash movement.
                For base-currency accounts it is derived automatically.
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
                defaultValue={
                  operation.description ??
                  ""
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/portfolio/operations"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Save changes
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}