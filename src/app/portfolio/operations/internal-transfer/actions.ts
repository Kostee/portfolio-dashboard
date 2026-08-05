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

export async function createInternalTransfer(
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

  const rawAmount = readText(formData, "amount");

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const description = readText(
    formData,
    "description",
  );

  const amount = parsePositiveNumber(rawAmount);

  if (!fromAccountId || !toAccountId) {
    redirect(
      "/portfolio/operations/internal-transfer?error=account_required",
    );
  }

  if (fromAccountId === toAccountId) {
    redirect(
      "/portfolio/operations/internal-transfer?error=same_account",
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      "/portfolio/operations/internal-transfer?error=date_required",
    );
  }

  if (amount === null) {
    redirect(
      "/portfolio/operations/internal-transfer?error=amount_required",
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      "/portfolio/operations/internal-transfer?error=currency_required",
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
      "/portfolio/operations/internal-transfer?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      "/portfolio/operations/internal-transfer?error=forbidden",
    );
  }

  const { data: accounts, error: accountsError } =
    await supabase
      .from("accounts")
      .select("id, base_currency")
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true)
      .in("id", [fromAccountId, toAccountId]);

  if (accountsError || accounts?.length !== 2) {
    console.error(
      "Transfer account validation failed:",
      accountsError,
    );

    redirect(
      "/portfolio/operations/internal-transfer?error=invalid_account",
    );
  }

  const currencyMismatch = accounts.some(
    (account) => account.base_currency !== currency,
  );

  if (currencyMismatch) {
    redirect(
      "/portfolio/operations/internal-transfer?error=currency_mismatch",
    );
  }

  const { error } = await supabase.rpc(
    "create_internal_transfer",
    {
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_operation_date: operationDate,
      p_amount: amount,
      p_currency: currency,
      p_description: description || undefined,
    },
  );

  if (error) {
    console.error(
      "Internal transfer creation failed:",
      error,
    );

    redirect(
      "/portfolio/operations/internal-transfer?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/operations?success=operation_added",
  );
}