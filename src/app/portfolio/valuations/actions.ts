"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  parsePositiveNumber,
  readText,
} from "../operations/form-helpers";
import { isOperationCurrency } from "../operations/operation-options";

const VALUATIONS_PATH = "/portfolio/valuations";

function parseOptionalNonNegativeNumber(
  formData: FormData,
  fieldName: string,
  errorCode: string,
): number | undefined {
  const rawValue = readText(formData, fieldName);

  if (!rawValue) {
    return undefined;
  }

  const normalizedValue = rawValue.replace(",", ".");

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalizedValue,
    )
  ) {
    redirect(
      `${VALUATIONS_PATH}?error=${errorCode}`,
    );
  }

  const parsedValue = Number(normalizedValue);

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    redirect(
      `${VALUATIONS_PATH}?error=${errorCode}`,
    );
  }

  return parsedValue;
}

function parseRequiredNonNegativeNumber(
  formData: FormData,
  fieldName: string,
  errorCode: string,
): number {
  const parsedValue =
    parseOptionalNonNegativeNumber(
      formData,
      fieldName,
      errorCode,
    );

  if (parsedValue === undefined) {
    redirect(
      `${VALUATIONS_PATH}?error=${errorCode}`,
    );
  }

  return parsedValue;
}

async function requireEditableWorkspace() {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

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

  if (membershipError || !membership) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      `${VALUATIONS_PATH}?error=workspace_not_found`,
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      `${VALUATIONS_PATH}?error=forbidden`,
    );
  }

  return {
    supabase,
    membership,
  };
}

export async function upsertReportedBalanceSnapshot(
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

  const snapshotDate = readText(
    formData,
    "snapshotDate",
  );

  const marketValue =
    parseRequiredNonNegativeNumber(
      formData,
      "marketValue",
      "reported_value_invalid",
    );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const marketValueBase =
    parseOptionalNonNegativeNumber(
      formData,
      "marketValueBase",
      "reported_base_value_invalid",
    );

  const notes = readText(
    formData,
    "notes",
  );

  if (!accountId) {
    redirect(
      `${VALUATIONS_PATH}?error=reported_account_required`,
    );
  }

  if (!instrumentId) {
    redirect(
      `${VALUATIONS_PATH}?error=reported_instrument_required`,
    );
  }

  if (!isValidIsoDate(snapshotDate)) {
    redirect(
      `${VALUATIONS_PATH}?error=date_invalid`,
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      `${VALUATIONS_PATH}?error=currency_invalid`,
    );
  }

  const [
    accountResult,
    instrumentResult,
  ] = await Promise.all([
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
      .select(
        "id, tracking_mode, default_currency",
      )
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
      "Snapshot account validation failed:",
      accountResult.error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=invalid_account`,
    );
  }

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Snapshot instrument validation failed:",
      instrumentResult.error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=invalid_instrument`,
    );
  }

  if (instrument.tracking_mode !== "balance") {
    redirect(
      `${VALUATIONS_PATH}?error=invalid_balance_instrument`,
    );
  }

  if (
    instrument.default_currency !== currency
  ) {
    redirect(
      `${VALUATIONS_PATH}?error=currency_mismatch`,
    );
  }

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: snapshotDate,
      p_market_value: marketValue,
      p_currency: currency,
      p_market_value_base:
        marketValueBase,
      p_notes: notes || undefined,
    },
  );

  if (error) {
    console.error(
      "Reported balance snapshot failed:",
      error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=snapshot_failed`,
    );
  }

  revalidatePath(VALUATIONS_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio");

  redirect(
    `${VALUATIONS_PATH}?success=snapshot_saved`,
  );
}

export async function upsertUnitsValuationSnapshot(
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

  const snapshotDate = readText(
    formData,
    "snapshotDate",
  );

  const quantity = parsePositiveNumber(
    readText(formData, "quantity"),
  );

  const marketValue =
    parseRequiredNonNegativeNumber(
      formData,
      "marketValue",
      "units_value_invalid",
    );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const enteredUnitPrice =
    parseOptionalNonNegativeNumber(
      formData,
      "unitPrice",
      "unit_price_invalid",
    );

  const marketValueBase =
    parseOptionalNonNegativeNumber(
      formData,
      "marketValueBase",
      "units_base_value_invalid",
    );

  const notes = readText(
    formData,
    "notes",
  );

  if (!accountId) {
    redirect(
      `${VALUATIONS_PATH}?error=units_account_required`,
    );
  }

  if (!instrumentId) {
    redirect(
      `${VALUATIONS_PATH}?error=units_instrument_required`,
    );
  }

  if (!isValidIsoDate(snapshotDate)) {
    redirect(
      `${VALUATIONS_PATH}?error=date_invalid`,
    );
  }

  if (quantity === null) {
    redirect(
      `${VALUATIONS_PATH}?error=quantity_invalid`,
    );
  }

  if (!isOperationCurrency(currency)) {
    redirect(
      `${VALUATIONS_PATH}?error=currency_invalid`,
    );
  }

  const [
    accountResult,
    instrumentResult,
  ] = await Promise.all([
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
      .select(
        "id, tracking_mode, default_currency",
      )
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
      "Snapshot account validation failed:",
      accountResult.error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=invalid_account`,
    );
  }

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Snapshot instrument validation failed:",
      instrumentResult.error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=invalid_instrument`,
    );
  }

  if (instrument.tracking_mode !== "units") {
    redirect(
      `${VALUATIONS_PATH}?error=invalid_units_instrument`,
    );
  }

  if (
    instrument.default_currency !== currency
  ) {
    redirect(
      `${VALUATIONS_PATH}?error=currency_mismatch`,
    );
  }

  const effectiveUnitPrice =
    enteredUnitPrice ??
    marketValue / quantity;

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: snapshotDate,
      p_quantity: quantity,
      p_unit_price: effectiveUnitPrice,
      p_market_value: marketValue,
      p_currency: currency,
      p_market_value_base:
        marketValueBase,
      p_notes: notes || undefined,
    },
  );

  if (error) {
    console.error(
      "Units valuation snapshot failed:",
      error,
    );

    redirect(
      `${VALUATIONS_PATH}?error=snapshot_failed`,
    );
  }

  revalidatePath(VALUATIONS_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio");

  redirect(
    `${VALUATIONS_PATH}?success=snapshot_saved`,
  );
}