"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isCashOperationType,
  isOperationCurrency,
} from "./operation-options";

function readText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

export async function createCashOperation(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const accountId = readText(formData, "accountId");
  const operationDate = readText(
    formData,
    "operationDate",
  );
  const operationType = readText(
    formData,
    "operationType",
  );
  const rawAmount = readText(formData, "amount").replace(
    ",",
    ".",
  );
  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();
  const description = readText(formData, "description");

  const amount = Number(rawAmount);

  if (!accountId) {
    redirect("/portfolio/operations?error=account_required");
  }

  if (!isValidDate(operationDate)) {
    redirect("/portfolio/operations?error=date_required");
  }

  if (!isCashOperationType(operationType)) {
    redirect("/portfolio/operations?error=type_required");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/portfolio/operations?error=amount_required");
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      "/portfolio/operations?error=currency_required",
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
      "/portfolio/operations?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect("/portfolio/operations?error=forbidden");
  }

  const { data: account, error: accountError } =
    await supabase
      .from("accounts")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", accountId)
      .eq("is_active", true)
      .maybeSingle();

  if (accountError || !account) {
    console.error(
      "Account validation failed:",
      accountError,
    );

    redirect(
      "/portfolio/operations?error=invalid_account",
    );
  }

  const { error } = await supabase.rpc(
    "create_cash_operation",
    {
      p_account_id: accountId,
      p_operation_date: operationDate,
      p_operation_type: operationType,
      p_amount: amount,
      p_currency: currency,
      p_description: description || undefined,
    },
  );

  if (error) {
    console.error(
      "Cash operation creation failed:",
      error,
    );

    redirect(
      "/portfolio/operations?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/operations?success=operation_added",
  );
}