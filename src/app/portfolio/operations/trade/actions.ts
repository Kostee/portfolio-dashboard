"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  fetchNbpTableARate,
} from "@/lib/finance/nbp-table-a";

import {
  isValidIsoDate,
  isValidOperationTime,
  parsePositiveNumber,
  readText,
} from "../form-helpers";
import { isOperationCurrency } from "../operation-options";

const TRADE_ERROR_PATH =
  "/portfolio/operations/trade";

export async function createTradeOperation(
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

  const operationType = readText(
    formData,
    "operationType",
  );

  const rawQuantity = readText(
    formData,
    "quantity",
  );

  const rawActualCashAmount = readText(
    formData,
    "actualCashAmount",
  );

  const cashCurrency = readText(
    formData,
    "cashCurrency",
  ).toUpperCase();

  const rawFeeAmount = readText(
    formData,
    "feeAmount",
  );

  const rawTaxAmount = readText(
    formData,
    "taxAmount",
  );

  const rawBaseValue = readText(
    formData,
    "baseValue",
  );

  const description = readText(
    formData,
    "description",
  );

  const fundingRouteId = readText(
    formData,
    "fundingRouteId",
  );

  const quantity =
    parsePositiveNumber(rawQuantity);

  const actualCashAmount =
    parsePositiveNumber(
      rawActualCashAmount,
    );

  let feeAmount: number | undefined;

  if (rawFeeAmount) {
    const parsedFeeAmount =
      parsePositiveNumber(rawFeeAmount);

    if (parsedFeeAmount === null) {
      redirect(
        `${TRADE_ERROR_PATH}?error=fee_invalid`,
      );
    }

    feeAmount = parsedFeeAmount;
  }

  let taxAmount: number | undefined;

  if (rawTaxAmount) {
    const parsedTaxAmount =
      parsePositiveNumber(rawTaxAmount);

    if (parsedTaxAmount === null) {
      redirect(
        `${TRADE_ERROR_PATH}?error=tax_invalid`,
      );
    }

    taxAmount = parsedTaxAmount;
  }

  let baseValue: number | undefined;

  if (rawBaseValue) {
    const parsedBaseValue =
      parsePositiveNumber(rawBaseValue);

    if (parsedBaseValue === null) {
      redirect(
        `${TRADE_ERROR_PATH}?error=base_value_invalid`,
      );
    }

    baseValue = parsedBaseValue;
  }

  if (!accountId) {
    redirect(
      `${TRADE_ERROR_PATH}?error=account_required`,
    );
  }

  if (!instrumentId) {
    redirect(
      `${TRADE_ERROR_PATH}?error=instrument_required`,
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      `${TRADE_ERROR_PATH}?error=date_required`,
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      `${TRADE_ERROR_PATH}?error=time_invalid`,
    );
  }

  if (
    operationType !== "buy" &&
    operationType !== "sell"
  ) {
    redirect(
      `${TRADE_ERROR_PATH}?error=type_required`,
    );
  }

  if (quantity === null) {
    redirect(
      `${TRADE_ERROR_PATH}?error=quantity_required`,
    );
  }

  if (actualCashAmount === null) {
    redirect(
      `${TRADE_ERROR_PATH}?error=cash_amount_required`,
    );
  }

  if (!isOperationCurrency(cashCurrency)) {
    redirect(
      `${TRADE_ERROR_PATH}?error=currency_required`,
    );
  }

  if (
    operationType === "buy" &&
    (feeAmount ?? 0) +
      (taxAmount ?? 0) >=
      actualCashAmount
  ) {
    redirect(
      `${TRADE_ERROR_PATH}?error=costs_too_high`,
    );
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
      `${TRADE_ERROR_PATH}?error=workspace_not_found`,
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      `${TRADE_ERROR_PATH}?error=forbidden`,
    );
  }

  const {
    data: workspace,
    error: workspaceError,
  } =
    await supabase
      .from("workspaces")
      .select("base_currency")
      .eq(
        "id",
        membership.workspace_id,
      )
      .single();

  if (
    workspaceError ||
    !workspace
  ) {
    console.error(
      "Trade workspace query failed:",
      workspaceError,
    );

    redirect(
      `${TRADE_ERROR_PATH}?error=workspace_not_found`,
    );
  }

  const [
    accountResult,
    instrumentResult,
  ] = await Promise.all([
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
      "Trade account validation failed:",
      accountResult.error,
    );

    redirect(
      `${TRADE_ERROR_PATH}?error=invalid_account`,
    );
  }

  if (
    instrumentResult.error ||
    !instrument
  ) {
    console.error(
      "Trade instrument validation failed:",
      instrumentResult.error,
    );

    redirect(
      `${TRADE_ERROR_PATH}?error=invalid_instrument`,
    );
  }

  if (instrument.tracking_mode !== "units") {
    redirect(
      `${TRADE_ERROR_PATH}?error=invalid_tracking_mode`,
    );
  }

  if (
    account.base_currency !== cashCurrency
  ) {
    redirect(
      `${TRADE_ERROR_PATH}?error=currency_mismatch`,
    );
  }

  /*
   * Manual base value remains an explicit
   * override. Otherwise foreign-currency
   * trades in a PLN-base workspace receive
   * their official NBP Table A base value
   * before the ledger RPC is called.
   */
  if (
    baseValue === undefined &&
    cashCurrency !==
      workspace.base_currency
  ) {
    try {
      const fx =
        await fetchNbpTableARate(
          cashCurrency,
          operationDate,
          workspace.base_currency,
        );

      baseValue =
        actualCashAmount *
        fx.rateToBase;
    } catch (error) {
      console.error(
        "Trade FX normalization failed:",
        error,
      );

      redirect(
        `${TRADE_ERROR_PATH}?error=fx_rate_unavailable`,
      );
    }
  }

  if (fundingRouteId) {
    const {
      data: fundingRoute,
      error: fundingRouteError,
    } = await supabase
      .from("portfolio_funding_routes")
      .select(
        "id, destination_account_id, status",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("id", fundingRouteId)
      .maybeSingle();

    if (
      fundingRouteError ||
      !fundingRoute ||
      fundingRoute.status !== "completed"
    ) {
      console.error(
        "Funding route validation failed:",
        fundingRouteError,
      );

      redirect(
        `${TRADE_ERROR_PATH}?error=funding_route_invalid`,
      );
    }

    if (
      fundingRoute.destination_account_id !==
      accountId
    ) {
      redirect(
        `${TRADE_ERROR_PATH}?error=funding_route_account_mismatch`,
      );
    }
  }

  const { error } = fundingRouteId
    ? await supabase.rpc(
        "create_funding_route_trade",
        {
          p_funding_route_id:
            fundingRouteId,
          p_account_id:
            accountId,
          p_instrument_id:
            instrumentId,
          p_operation_date:
            operationDate,
          p_operation_time:
            operationTime || undefined,
          p_operation_type:
            operationType,
          p_quantity:
            quantity,
          p_actual_cash_amount:
            actualCashAmount,
          p_cash_currency:
            cashCurrency,
          p_fee_amount:
            feeAmount,
          p_tax_amount:
            taxAmount,
          p_base_value:
            baseValue,
          p_description:
            description || undefined,
        },
      )
    : await supabase.rpc(
        "create_trade_operation",
        {
          p_account_id:
            accountId,
          p_instrument_id:
            instrumentId,
          p_operation_date:
            operationDate,
          p_operation_time:
            operationTime || undefined,
          p_operation_type:
            operationType,
          p_quantity:
            quantity,
          p_actual_cash_amount:
            actualCashAmount,
          p_cash_currency:
            cashCurrency,
          p_fee_amount:
            feeAmount,
          p_tax_amount:
            taxAmount,
          p_base_value:
            baseValue,
          p_description:
            description || undefined,
        },
      );

  if (error) {
    console.error(
      "Trade operation creation failed:",
      error,
    );

    redirect(
      `${TRADE_ERROR_PATH}?error=creation_failed`,
    );
  }

  revalidatePath("/portfolio/operations");
  revalidatePath(
    "/portfolio/operations/trade",
  );
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/operations?success=operation_added",
  );
}
