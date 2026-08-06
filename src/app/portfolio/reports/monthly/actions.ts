"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  parsePositiveNumber,
  readText,
} from "../../operations/form-helpers";
import { isOperationCurrency } from "../../operations/operation-options";

const MONTHLY_REPORT_PATH =
  "/portfolio/reports/monthly";

function buildMonthlyReportPath(
  asOfDate: string,
  parameterName: "error" | "success",
  parameterValue: string,
): string {
  const searchParams = new URLSearchParams({
    asOf: asOfDate,
    [parameterName]: parameterValue,
  });

  return `${MONTHLY_REPORT_PATH}?${searchParams.toString()}`;
}

function redirectWithError(
  asOfDate: string,
  errorCode: string,
): never {
  redirect(
    buildMonthlyReportPath(
      asOfDate,
      "error",
      errorCode,
    ),
  );
}

function redirectWithSuccess(
  asOfDate: string,
  successCode: string,
): never {
  redirect(
    buildMonthlyReportPath(
      asOfDate,
      "success",
      successCode,
    ),
  );
}

function parseOptionalNonNegativeNumber(
  formData: FormData,
  fieldName: string,
  asOfDate: string,
  errorCode: string,
): number | undefined {
  const rawValue = readText(
    formData,
    fieldName,
  );

  if (!rawValue) {
    return undefined;
  }

  const normalizedValue =
    rawValue.replace(",", ".");

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      normalizedValue,
    )
  ) {
    redirectWithError(
      asOfDate,
      errorCode,
    );
  }

  const parsedValue = Number(
    normalizedValue,
  );

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    redirectWithError(
      asOfDate,
      errorCode,
    );
  }

  return parsedValue;
}

function parseRequiredNonNegativeNumber(
  formData: FormData,
  fieldName: string,
  asOfDate: string,
  errorCode: string,
): number {
  const parsedValue =
    parseOptionalNonNegativeNumber(
      formData,
      fieldName,
      asOfDate,
      errorCode,
    );

  if (parsedValue === undefined) {
    redirectWithError(
      asOfDate,
      errorCode,
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
      `${MONTHLY_REPORT_PATH}?error=workspace_not_found`,
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      `${MONTHLY_REPORT_PATH}?error=forbidden`,
    );
  }

  const {
    data: workspace,
    error: workspaceError,
  } = await supabase
    .from("workspaces")
    .select("base_currency")
    .eq("id", membership.workspace_id)
    .single();

  if (workspaceError || !workspace) {
    console.error(
      "Workspace query failed:",
      workspaceError,
    );

    redirect(
      `${MONTHLY_REPORT_PATH}?error=workspace_not_found`,
    );
  }

  return {
    supabase,
    membership,
    workspaceBaseCurrency:
      workspace.base_currency,
  };
}

export async function saveMonthlyUnitSnapshot(
  formData: FormData,
) {
  const {
    supabase,
    membership,
    workspaceBaseCurrency,
  } = await requireEditableWorkspace();

  const asOfDate = readText(
    formData,
    "asOfDate",
  );

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  const quantity = parsePositiveNumber(
    readText(formData, "quantity"),
  );

  const marketValue =
    parseRequiredNonNegativeNumber(
      formData,
      "marketValue",
      asOfDate,
      "unit_value_invalid",
    );

  const currency = readText(
    formData,
    "currency",
  ).toUpperCase();

  const marketValueBase =
    parseOptionalNonNegativeNumber(
      formData,
      "marketValueBase",
      asOfDate,
      "base_value_invalid",
    );

  const notes = readText(
    formData,
    "notes",
  );

  if (!isValidIsoDate(asOfDate)) {
    redirectWithError(
      asOfDate,
      "date_invalid",
    );
  }

  if (!accountId) {
    redirectWithError(
      asOfDate,
      "account_required",
    );
  }

  if (!instrumentId) {
    redirectWithError(
      asOfDate,
      "instrument_required",
    );
  }

  if (quantity === null) {
    redirectWithError(
      asOfDate,
      "quantity_invalid",
    );
  }

  if (!isOperationCurrency(currency)) {
    redirectWithError(
      asOfDate,
      "currency_invalid",
    );
  }

  if (
    currency !== workspaceBaseCurrency &&
    marketValueBase === undefined
  ) {
    redirectWithError(
      asOfDate,
      "base_value_required",
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

  if (
    accountResult.error ||
    !accountResult.data
  ) {
    console.error(
      "Monthly snapshot account validation failed:",
      accountResult.error,
    );

    redirectWithError(
      asOfDate,
      "invalid_account",
    );
  }

  const instrument =
    instrumentResult.data;

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Monthly snapshot instrument validation failed:",
      instrumentResult.error,
    );

    redirectWithError(
      asOfDate,
      "invalid_instrument",
    );
  }

  if (instrument.tracking_mode !== "units") {
    redirectWithError(
      asOfDate,
      "invalid_units_instrument",
    );
  }

  if (
    instrument.default_currency !== currency
  ) {
    redirectWithError(
      asOfDate,
      "currency_mismatch",
    );
  }

  const unitPrice =
    quantity === 0
      ? undefined
      : marketValue / quantity;

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: asOfDate,
      p_quantity: quantity,
      p_unit_price: unitPrice,
      p_market_value: marketValue,
      p_currency: currency,
      p_market_value_base:
        marketValueBase,
      p_notes: notes || undefined,
    },
  );

  if (error) {
    console.error(
      "Monthly unit snapshot failed:",
      error,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  revalidatePath(MONTHLY_REPORT_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio/valuations");

  redirectWithSuccess(
    asOfDate,
    "unit_saved",
  );
}

export async function confirmMonthlyUnitSnapshot(
  formData: FormData,
) {
  const {
    supabase,
    membership,
    workspaceBaseCurrency,
  } = await requireEditableWorkspace();

  const asOfDate = readText(
    formData,
    "asOfDate",
  );

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  if (!isValidIsoDate(asOfDate)) {
    redirectWithError(
      asOfDate,
      "date_invalid",
    );
  }

  const {
    data: positions,
    error: positionsError,
  } = await supabase.rpc(
    "get_portfolio_unit_positions_as_of",
    {
      p_workspace_id:
        membership.workspace_id,
      p_as_of_date: asOfDate,
    },
  );

  if (positionsError) {
    console.error(
      "As-of unit positions query failed:",
      positionsError,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  const position = positions?.find(
    (item) =>
      item.account_id === accountId &&
      item.instrument_id === instrumentId,
  );

  if (
    !position ||
    position.snapshot_id === null ||
    position.valuation_market_value ===
      null ||
    position.valuation_currency === null ||
    position.quantity === null
  ) {
    redirectWithError(
      asOfDate,
      "valuation_missing",
    );
  }

  if (
    position.valuation_status !==
    "matched"
  ) {
    redirectWithError(
      asOfDate,
      "quantity_mismatch",
    );
  }

  if (
    position.valuation_currency !==
      workspaceBaseCurrency &&
    position.valuation_market_value_base ===
      null
  ) {
    redirectWithError(
      asOfDate,
      "base_value_required",
    );
  }

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: asOfDate,
      p_quantity: Number(
        position.quantity,
      ),
      p_unit_price:
        position.valuation_unit_price ??
        undefined,
      p_market_value: Number(
        position.valuation_market_value,
      ),
      p_currency:
        position.valuation_currency,
      p_market_value_base:
        position
          .valuation_market_value_base ??
        undefined,
      p_notes: position.valuation_date
        ? `Confirmed unchanged from ${position.valuation_date}`
        : "Confirmed for monthly report",
    },
  );

  if (error) {
    console.error(
      "Monthly unit confirmation failed:",
      error,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  revalidatePath(MONTHLY_REPORT_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio/valuations");

  redirectWithSuccess(
    asOfDate,
    "unit_confirmed",
  );
}

export async function saveMonthlyReportedSnapshot(
  formData: FormData,
) {
  const {
    supabase,
    membership,
    workspaceBaseCurrency,
  } = await requireEditableWorkspace();

  const asOfDate = readText(
    formData,
    "asOfDate",
  );

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  const marketValue =
    parseRequiredNonNegativeNumber(
      formData,
      "marketValue",
      asOfDate,
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
      asOfDate,
      "base_value_invalid",
    );

  const notes = readText(
    formData,
    "notes",
  );

  if (!isValidIsoDate(asOfDate)) {
    redirectWithError(
      asOfDate,
      "date_invalid",
    );
  }

  if (!accountId) {
    redirectWithError(
      asOfDate,
      "account_required",
    );
  }

  if (!instrumentId) {
    redirectWithError(
      asOfDate,
      "instrument_required",
    );
  }

  if (!isOperationCurrency(currency)) {
    redirectWithError(
      asOfDate,
      "currency_invalid",
    );
  }

  if (
    currency !== workspaceBaseCurrency &&
    marketValueBase === undefined
  ) {
    redirectWithError(
      asOfDate,
      "base_value_required",
    );
  }

  const [
    accountResult,
    instrumentResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, account_type")
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

  if (
    accountResult.error ||
    !accountResult.data
  ) {
    console.error(
      "Reported snapshot account validation failed:",
      accountResult.error,
    );

    redirectWithError(
      asOfDate,
      "invalid_account",
    );
  }

  const instrument =
    instrumentResult.data;

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Reported snapshot instrument validation failed:",
      instrumentResult.error,
    );

    redirectWithError(
      asOfDate,
      "invalid_instrument",
    );
  }

  if (
    instrument.tracking_mode !==
    "balance"
  ) {
    redirectWithError(
      asOfDate,
      "invalid_balance_instrument",
    );
  }

  if (
    instrument.default_currency !==
    currency
  ) {
    redirectWithError(
      asOfDate,
      "currency_mismatch",
    );
  }

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: asOfDate,
      p_market_value: marketValue,
      p_currency: currency,
      p_market_value_base:
        marketValueBase,
      p_notes: notes || undefined,
    },
  );

  if (error) {
    console.error(
      "Monthly reported snapshot failed:",
      error,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  revalidatePath(MONTHLY_REPORT_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio/valuations");

  redirectWithSuccess(
    asOfDate,
    "reported_saved",
  );
}

export async function confirmMonthlyReportedSnapshot(
  formData: FormData,
) {
  const {
    supabase,
    membership,
    workspaceBaseCurrency,
  } = await requireEditableWorkspace();

  const asOfDate = readText(
    formData,
    "asOfDate",
  );

  const accountId = readText(
    formData,
    "accountId",
  );

  const instrumentId = readText(
    formData,
    "instrumentId",
  );

  if (!isValidIsoDate(asOfDate)) {
    redirectWithError(
      asOfDate,
      "date_invalid",
    );
  }

  const {
    data: balances,
    error: balancesError,
  } = await supabase.rpc(
    "get_portfolio_reported_balances_as_of",
    {
      p_workspace_id:
        membership.workspace_id,
      p_as_of_date: asOfDate,
    },
  );

  if (balancesError) {
    console.error(
      "As-of reported balances query failed:",
      balancesError,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  const balance = balances?.find(
    (item) =>
      item.account_id === accountId &&
      item.instrument_id === instrumentId,
  );

  if (
    !balance ||
    balance.snapshot_id === null ||
    balance.reported_balance === null ||
    balance.currency === null
  ) {
    redirectWithError(
      asOfDate,
      "valuation_missing",
    );
  }

  if (
    balance.currency !==
      workspaceBaseCurrency &&
    balance.base_reported_balance ===
      null
  ) {
    redirectWithError(
      asOfDate,
      "base_value_required",
    );
  }

  const { error } = await supabase.rpc(
    "upsert_position_snapshot",
    {
      p_account_id: accountId,
      p_instrument_id: instrumentId,
      p_snapshot_date: asOfDate,
      p_market_value: Number(
        balance.reported_balance,
      ),
      p_currency: balance.currency,
      p_market_value_base:
        balance.base_reported_balance ??
        undefined,
      p_notes: balance.snapshot_date
        ? `Confirmed unchanged from ${balance.snapshot_date}`
        : "Confirmed for monthly report",
    },
  );

  if (error) {
    console.error(
      "Monthly reported confirmation failed:",
      error,
    );

    redirectWithError(
      asOfDate,
      "snapshot_failed",
    );
  }

  revalidatePath(MONTHLY_REPORT_PATH);
  revalidatePath("/portfolio/state");
  revalidatePath("/portfolio/valuations");

  redirectWithSuccess(
    asOfDate,
    "reported_confirmed",
  );
}

export async function createMonthlyReportSnapshot(
  formData: FormData,
) {
  const {
    supabase,
    membership,
  } = await requireEditableWorkspace();

  const asOfDate = readText(
    formData,
    "asOfDate",
  );

  if (!isValidIsoDate(asOfDate)) {
    redirectWithError(
      asOfDate,
      "date_invalid",
    );
  }

  const {
    data: reportRunId,
    error,
  } = await supabase.rpc(
    "create_monthly_report_run",
    {
      p_workspace_id:
        membership.workspace_id,
      p_as_of_date: asOfDate,
    },
  );

  if (error) {
    console.error(
      "Monthly report snapshot creation failed:",
      error,
    );

    redirectWithError(
      asOfDate,
      "report_snapshot_failed",
    );
  }

  if (!reportRunId) {
    console.error(
      "Monthly report snapshot creation returned no ID.",
    );

    redirectWithError(
      asOfDate,
      "report_snapshot_failed",
    );
  }

  revalidatePath(
    MONTHLY_REPORT_PATH,
  );

  revalidatePath(
    "/portfolio/state",
  );

  redirect(
    `/portfolio/reports/monthly/${reportRunId}`,
  );
}