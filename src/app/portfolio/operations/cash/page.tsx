import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createCashOperation } from "../actions";
import { getDateInTimeZone } from "../form-helpers";
import {
  CASH_OPERATION_TYPE_LABELS,
  CASH_OPERATION_TYPES,
  OPERATION_CURRENCIES,
} from "../operation-options";

type SearchParamValue =
  | string
  | string[]
  | undefined;

type CashOperationPageProps = {
  searchParams: Promise<{
    error?: SearchParamValue;
    success?: SearchParamValue;
  }>;
};

function firstSearchParam(
  value: SearchParamValue,
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

const ERROR_MESSAGES: Record<string, string> = {
  account_required:
    "Select an account.",
  date_required:
    "Enter a valid operation date.",
  time_invalid:
    "Enter a valid operation time.",
  type_required:
    "Select a supported cash operation type.",
  amount_required:
    "Enter a positive amount.",
  currency_required:
    "Select a supported currency.",
  workspace_not_found:
    "The portfolio workspace is unavailable.",
  forbidden:
    "You cannot create operations in this workspace.",
  invalid_account:
    "The selected account is unavailable.",
  creation_failed:
    "The operation could not be posted. Check the server log for details.",
};

export default async function CashOperationPage({
  searchParams,
}: CashOperationPageProps) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const resolvedSearchParams =
    await searchParams;

  const errorCode =
    firstSearchParam(
      resolvedSearchParams.error,
    );

  const success =
    firstSearchParam(
      resolvedSearchParams.success,
    );

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

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

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
      .select(
        "name, timezone",
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
        "id, owner_id, provider_id, name, is_active",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      ),
  ]);

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

  const workspace =
    workspaceResult.data;

  const owners =
    ownersResult.data ?? [];

  const providers =
    providersResult.data ?? [];

  const accounts =
    accountsResult.data ?? [];

  const ownerMap =
    new Map(
      owners.map((owner) => [
        owner.id,
        owner,
      ]),
    );

  const providerMap =
    new Map(
      providers.map((provider) => [
        provider.id,
        provider,
      ]),
    );

  const activeAccounts =
    [...accounts]
      .filter(
        (account) =>
          account.is_active,
      )
      .sort((first, second) => {
        const firstOwner =
          ownerMap.get(
            first.owner_id,
          );

        const secondOwner =
          ownerMap.get(
            second.owner_id,
          );

        return (
          (
            firstOwner?.sort_order ??
            999
          ) -
            (
              secondOwner?.sort_order ??
              999
            ) ||
          (
            firstOwner?.display_name ??
            ""
          ).localeCompare(
            secondOwner?.display_name ??
              "",
          ) ||
          first.name.localeCompare(
            second.name,
          )
        );
      });

  const canEdit =
    membership.role === "admin" ||
    membership.role === "editor";

  const workspaceTimeZone =
    workspace?.timezone ??
    "Europe/Warsaw";

  const today =
    getDateInTimeZone(
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
            Portfolio operation
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Add cash operation
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Record a deposit, withdrawal,
            interest, fee or tax without
            changing an instrument quantity.
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Workspace:{" "}
            {workspace?.name ??
              "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {success ===
            "operation_added" && (
            <p className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              The operation was posted.
            </p>
          )}

          {errorCode && (
            <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {ERROR_MESSAGES[
                errorCode
              ] ??
                "The operation could not be posted. Check the selected values and server log."}
            </p>
          )}

          {canEdit &&
          activeAccounts.length > 0 ? (
            <form
              action={createCashOperation}
              className="space-y-5"
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
                        key={
                          operationType
                        }
                        value={
                          operationType
                        }
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
                  <option
                    value=""
                    disabled
                  >
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
                          key={
                            account.id
                          }
                          value={
                            account.id
                          }
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

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">
                <Link
                  href="/portfolio/operations"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Post operation
                </button>
              </div>
            </form>
          ) : (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Operation creation is
              unavailable. You need an
              editor role and at least one
              active account.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
