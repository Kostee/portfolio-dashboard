"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  isValidOperationTime,
  parsePositiveNumber,
  readText,
} from "../operations/form-helpers";
import { isOperationCurrency } from "../operations/operation-options";

const OPENING_STATE_PATH =
  "/portfolio/opening-state";

async function requireEditableWorkspace() {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .order("created_at", {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=workspace_not_found`,
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      `${OPENING_STATE_PATH}?error=forbidden`,
    );
  }

  return {
    supabase,
    membership,
  };
}

function parseOptionalPositiveNumber(
  formData: FormData,
  fieldName: string,
  errorCode: string,
): number | undefined {
  const rawValue = readText(
    formData,
    fieldName,
  );

  if (!rawValue) {
    return undefined;
  }

  const parsedValue =
    parsePositiveNumber(rawValue);

  if (parsedValue === null) {
    redirect(
      `${OPENING_STATE_PATH}?error=${errorCode}`,
    );
  }

  return parsedValue;
}

export async function createOpeningUnitsPosition(
  formData: FormData,
) {
  const { supabase, membership } =
    await requireEditableWorkspace();

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  const operationDate = readText(
    formData,
    "operationDate",
  );

  const operationTime = readText(
    formData,
    "operationTime",
  );

  const quantity = parsePositiveNumber(
    readText(formData, "quantity"),
  );

  const description = readText(
    formData,
    "description",
  );

  if (!accountId) {
    redirect(
      `${OPENING_STATE_PATH}?error=units_account_required`,
    );
  }

  if (!instrumentId) {
    redirect(
      `${OPENING_STATE_PATH}?error=units_instrument_required`,
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      `${OPENING_STATE_PATH}?error=date_required`,
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      `${OPENING_STATE_PATH}?error=time_invalid`,
    );
  }

  if (quantity === null) {
    redirect(
      `${OPENING_STATE_PATH}?error=quantity_required`,
    );
  }

  const [accountResult, instrumentResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id")
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq("id", accountId)
        .eq("is_active", true)
        .maybeSingle(),

      supabase
        .from("instruments")
        .select("id, tracking_mode")
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq("id", instrumentId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (
    accountResult.error ||
    !accountResult.data
  ) {
    console.error(
      "Opening account validation failed:",
      accountResult.error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=invalid_account`,
    );
  }

  if (
    instrumentResult.error ||
    !instrumentResult.data
  ) {
    console.error(
      "Opening instrument validation failed:",
      instrumentResult.error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=invalid_instrument`,
    );
  }

  if (
    instrumentResult.data.tracking_mode !==
    "units"
  ) {
    redirect(
      `${OPENING_STATE_PATH}?error=invalid_units_instrument`,
    );
  }

  const { error } = await supabase.rpc(
    "create_opening_units_position",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_operation_date: operationDate,
      p_operation_time:
        operationTime || undefined,
      p_quantity: quantity,
      p_description:
        description || undefined,
    },
  );

  if (error) {
    console.error(
      "Opening units position creation failed:",
      error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=units_creation_failed`,
    );
  }

  revalidatePath(OPENING_STATE_PATH);
  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    `${OPENING_STATE_PATH}?success=units_added`,
  );
}

export async function createOpeningCashBalance(
  formData: FormData,
) {
  const { supabase, membership } =
    await requireEditableWorkspace();

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

  const amount = parsePositiveNumber(
    readText(formData, "amount"),
  );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const baseValue =
    parseOptionalPositiveNumber(
      formData,
      "baseValue",
      "cash_base_value_invalid",
    );

  const description = readText(
    formData,
    "description",
  );

  if (!accountId) {
    redirect(
      `${OPENING_STATE_PATH}?error=cash_account_required`,
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      `${OPENING_STATE_PATH}?error=date_required`,
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      `${OPENING_STATE_PATH}?error=time_invalid`,
    );
  }

  if (amount === null) {
    redirect(
      `${OPENING_STATE_PATH}?error=cash_amount_required`,
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      `${OPENING_STATE_PATH}?error=currency_required`,
    );
  }

  const { data: account, error: accountError } =
    await supabase
      .from("accounts")
      .select("id, base_currency")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("id", accountId)
      .eq("is_active", true)
      .maybeSingle();

  if (accountError || !account) {
    console.error(
      "Opening cash account validation failed:",
      accountError,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=invalid_account`,
    );
  }

  if (account.base_currency !== currency) {
    redirect(
      `${OPENING_STATE_PATH}?error=currency_mismatch`,
    );
  }

  const { error } = await supabase.rpc(
    "create_opening_cash_balance",
    {
      p_account_id: accountId,
      p_operation_date: operationDate,
      p_operation_time:
        operationTime || undefined,
      p_amount: amount,
      p_currency: currency,
      p_base_value: baseValue,
      p_description:
        description || undefined,
    },
  );

  if (error) {
    console.error(
      "Opening cash balance creation failed:",
      error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=cash_creation_failed`,
    );
  }

  revalidatePath(OPENING_STATE_PATH);
  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    `${OPENING_STATE_PATH}?success=cash_added`,
  );
}

export async function createOpeningReportedBalance(
  formData: FormData,
) {
  const { supabase, membership } =
    await requireEditableWorkspace();

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  const operationDate = readText(
    formData,
    "operationDate",
  );

  const operationTime = readText(
    formData,
    "operationTime",
  );

  const valueAmount = parsePositiveNumber(
    readText(formData, "valueAmount"),
  );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const baseValue =
    parseOptionalPositiveNumber(
      formData,
      "baseValue",
      "reported_base_value_invalid",
    );

  const description = readText(
    formData,
    "description",
  );

  if (!accountId) {
    redirect(
      `${OPENING_STATE_PATH}?error=reported_account_required`,
    );
  }

  if (!instrumentId) {
    redirect(
      `${OPENING_STATE_PATH}?error=reported_instrument_required`,
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      `${OPENING_STATE_PATH}?error=date_required`,
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      `${OPENING_STATE_PATH}?error=time_invalid`,
    );
  }

  if (valueAmount === null) {
    redirect(
      `${OPENING_STATE_PATH}?error=reported_value_required`,
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      `${OPENING_STATE_PATH}?error=currency_required`,
    );
  }

  const [accountResult, instrumentResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, base_currency")
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq("id", accountId)
        .eq("is_active", true)
        .maybeSingle(),

      supabase
        .from("instruments")
        .select("id, tracking_mode")
        .eq(
          "workspace_id",
          membership.workspace_id,
        )
        .eq("id", instrumentId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  const account = accountResult.data;
  const instrument =
    instrumentResult.data;

  if (accountResult.error || !account) {
    console.error(
      "Reported balance account validation failed:",
      accountResult.error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=invalid_account`,
    );
  }

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Reported balance instrument validation failed:",
      instrumentResult.error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=invalid_instrument`,
    );
  }

  if (instrument.tracking_mode !== "balance") {
    redirect(
      `${OPENING_STATE_PATH}?error=invalid_balance_instrument`,
    );
  }

  if (account.base_currency !== currency) {
    redirect(
      `${OPENING_STATE_PATH}?error=currency_mismatch`,
    );
  }

  const { error } = await supabase.rpc(
    "create_opening_reported_balance",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_operation_date: operationDate,
      p_operation_time:
        operationTime || undefined,
      p_value_amount: valueAmount,
      p_currency: currency,
      p_base_value: baseValue,
      p_description:
        description || undefined,
    },
  );

  if (error) {
    console.error(
      "Opening reported balance creation failed:",
      error,
    );

    redirect(
      `${OPENING_STATE_PATH}?error=reported_creation_failed`,
    );
  }

  revalidatePath(OPENING_STATE_PATH);
  revalidatePath("/portfolio/operations");
  revalidatePath("/portfolio");

  redirect(
    `${OPENING_STATE_PATH}?success=reported_added`,
  );
}