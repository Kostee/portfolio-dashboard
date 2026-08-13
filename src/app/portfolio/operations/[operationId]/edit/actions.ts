"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  isValidOperationTime,
  parsePositiveNumber,
  readText,
} from "../../form-helpers";
import { isOperationCurrency } from "../../operation-options";

function errorPath(
  operationId: string,
  error: string,
): string {
  return `/portfolio/operations/${operationId}/edit?error=${error}`;
}

export async function updateTradeOperation(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const operationId = readText(
    formData,
    "operationId",
  );

  if (!operationId) {
    redirect(
      "/portfolio/operations?error=operation_not_found",
    );
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
        errorPath(
          operationId,
          "fee_invalid",
        ),
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
        errorPath(
          operationId,
          "tax_invalid",
        ),
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
        errorPath(
          operationId,
          "base_value_invalid",
        ),
      );
    }

    baseValue = parsedBaseValue;
  }

  if (!accountId) {
    redirect(
      errorPath(
        operationId,
        "account_required",
      ),
    );
  }

  if (!instrumentId) {
    redirect(
      errorPath(
        operationId,
        "instrument_required",
      ),
    );
  }

  if (!isValidIsoDate(operationDate)) {
    redirect(
      errorPath(
        operationId,
        "date_invalid",
      ),
    );
  }

  if (
    operationTime &&
    !isValidOperationTime(operationTime)
  ) {
    redirect(
      errorPath(
        operationId,
        "time_invalid",
      ),
    );
  }

  if (
    operationType !== "buy" &&
    operationType !== "sell"
  ) {
    redirect(
      errorPath(
        operationId,
        "type_required",
      ),
    );
  }

  if (quantity === null) {
    redirect(
      errorPath(
        operationId,
        "quantity_required",
      ),
    );
  }

  if (actualCashAmount === null) {
    redirect(
      errorPath(
        operationId,
        "cash_amount_required",
      ),
    );
  }

  if (!isOperationCurrency(cashCurrency)) {
    redirect(
      errorPath(
        operationId,
        "currency_required",
      ),
    );
  }

  if (
    operationType === "buy" &&
    (feeAmount ?? 0) +
      (taxAmount ?? 0) >=
      actualCashAmount
  ) {
    redirect(
      errorPath(
        operationId,
        "costs_too_high",
      ),
    );
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

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      errorPath(
        operationId,
        "workspace_not_found",
      ),
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect(
      errorPath(
        operationId,
        "forbidden",
      ),
    );
  }

  const { error } = await supabase.rpc(
    "update_manual_trade_operation",
    {
      p_operation_id:
        operationId,
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
      "Trade operation update failed:",
      error,
    );

    redirect(
      errorPath(
        operationId,
        "update_failed",
      ),
    );
  }

  revalidatePath(
    "/portfolio/operations",
  );
  revalidatePath(
    "/portfolio/state",
  );
  revalidatePath(
    "/portfolio/reports/weekly",
  );
  revalidatePath(
    "/portfolio/reports/monthly",
  );
  revalidatePath(
    "/portfolio",
  );

  redirect(
    "/portfolio/operations",
  );
}