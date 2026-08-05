"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  parsePositiveNumber,
  readText,
} from "../form-helpers";
import { isOperationCurrency } from "../operation-options";

export async function createCurrencyExchange(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const fromAccountId = readText(
    formData,
    "fromAccountId",
  );

  const toAccountId = readText(
    formData,
    "toAccountId",
  );

  const operationDate = readText(
    formData,
    "operationDate",
  );

  const fromAmount = parsePositiveNumber(
    readText(formData, "fromAmount"),
  );

  const toAmount = parsePositiveNumber(
    readText(formData, "toAmount"),
  );

  const fromCurrency = readText(
    formData,
    "fromCurrency",
  ).toUpperCase();

  const toCurrency = readText(
    formData,
    "toCurrency",
  ).toUpperCase();

  const rawBaseValue = readText(formData, "baseValue");

  let baseValue: number | undefined;

  if (rawBaseValue) {
    const parsedBaseValue =
      parsePositiveNumber(rawBaseValue);

    if (parsedBaseValue === null) {
      redirect(
        "/portfolio/operations/currency-exchange?error=base_value_invalid",
      );
    }

    baseValue = parsedBaseValue;
  }

  const description = readText(
    formData,
    "description",
  );

  if (!fromAccountId || !toAccountId) {
    redirect(
      "/portfolio/operations/currency-exchange?error=account_required",
    );
  }

  if (fromAccountId === toAccountId) {
    redirect(
      "/portfolio/operations/currency-exchange?error=same_account",
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      "/portfolio/operations/currency-exchange?error=date_required",
    );
  }

  if (fromAmount === null || toAmount === null) {
    redirect(
      "/portfolio/operations/currency-exchange?error=amount_required",
    );
  }

  if (
    !isOperationCurrency(fromCurrency) ||
    !isOperationCurrency(toCurrency)
  ) {
    redirect(
      "/portfolio/operations/currency-exchange?error=currency_required",
    );
  }

  if (fromCurrency === toCurrency) {
    redirect(
      "/portfolio/operations/currency-exchange?error=same_currency",
    );
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      "/portfolio/operations/currency-exchange?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      "/portfolio/operations/currency-exchange?error=forbidden",
    );
  }

  const [
    accountsResult,
    workspaceResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, base_currency")
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true)
      .in("id", [fromAccountId, toAccountId]),

    supabase
      .from("workspaces")
      .select("base_currency")
      .eq("id", membership.workspace_id)
      .single(),
  ]);

  const accounts = accountsResult.data;
  const workspace = workspaceResult.data;

  if (accountsResult.error || accounts?.length !== 2) {
    console.error(
      "Exchange account validation failed:",
      accountsResult.error,
    );

    redirect(
      "/portfolio/operations/currency-exchange?error=invalid_account",
    );
  }

  const sourceAccount = accounts.find(
    (account) => account.id === fromAccountId,
  );

  const destinationAccount = accounts.find(
    (account) => account.id === toAccountId,
  );

  if (
    sourceAccount?.base_currency !== fromCurrency ||
    destinationAccount?.base_currency !== toCurrency
  ) {
    redirect(
      "/portfolio/operations/currency-exchange?error=currency_mismatch",
    );
  }

  const workspaceBaseCurrency =
    workspace?.base_currency ?? "PLN";

  if (
    fromCurrency !== workspaceBaseCurrency &&
    toCurrency !== workspaceBaseCurrency &&
    baseValue === undefined
  ) {
    redirect(
      "/portfolio/operations/currency-exchange?error=base_value_required",
    );
  }

  const { error } = await supabase.rpc(
    "create_currency_exchange",
    {
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_operation_date: operationDate,
      p_from_amount: fromAmount,
      p_from_currency: fromCurrency,
      p_to_amount: toAmount,
      p_to_currency: toCurrency,
      p_base_value: baseValue,
      p_description: description || undefined,
    },
  );

  if (error) {
    console.error(
      "Currency exchange creation failed:",
      error,
    );

    redirect(
      "/portfolio/operations/currency-exchange?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/operations?success=operation_added",
  );
}