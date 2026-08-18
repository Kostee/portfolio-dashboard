"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  isValidOperationTime,
  parsePositiveNumber,
  readText,
} from "./form-helpers";
import {
  isCashOperationType,
  isOperationCurrency,
} from "./operation-options";

export async function createCashOperation(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const accountId = readText(
    formData,
    "accountId",
  );

  const operationDate = readText(
    formData,
    "operationDate",
  );

  const operationTime = readText(
    formData,
    "operationTime",
  );

  const operationType = readText(
    formData,
    "operationType",
  );

  const rawAmount = readText(
    formData,
    "amount",
  );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const description = readText(
    formData,
    "description",
  );

  const amount = parsePositiveNumber(rawAmount);

  if (!accountId) {
    redirect(
      "/portfolio/operations/cash?error=account_required",
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      "/portfolio/operations/cash?error=date_required",
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      "/portfolio/operations/cash?error=time_invalid",
    );
  }

  if (!isCashOperationType(operationType)) {
    redirect(
      "/portfolio/operations/cash?error=type_required",
    );
  }

  if (amount === null) {
    redirect(
      "/portfolio/operations/cash?error=amount_required",
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      "/portfolio/operations/cash?error=currency_required",
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
      "/portfolio/operations/cash?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      "/portfolio/operations/cash?error=forbidden",
    );
  }

  const { data: account, error: accountError } =
    await supabase
      .from("accounts")
      .select("id")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("id", accountId)
      .eq("is_active", true)
      .maybeSingle();

  if (accountError || !account) {
    console.error(
      "Account validation failed:",
      accountError,
    );

    redirect(
      "/portfolio/operations/cash?error=invalid_account",
    );
  }

  const { error } = await supabase.rpc(
    "create_cash_operation",
    {
      p_account_id: accountId,
      p_operation_date: operationDate,
      p_operation_time:
        operationTime || undefined,
      p_operation_type: operationType,
      p_amount: amount,
      p_currency: currency,
      p_description:
        description || undefined,
    },
  );

  if (error) {
    console.error(
      "Cash operation creation failed:",
      error,
    );

    redirect(
      "/portfolio/operations/cash?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio/operations/cash");
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/operations/cash?success=operation_added",
  );
}