import type { Database } from "@/types/database.types";

export type PortfolioOperationType =
  Database["public"]["Enums"]["portfolio_operation_type"];

export const OPERATION_TYPE_LABELS: Record<
  PortfolioOperationType,
  string
> = {
  opening_position: "Opening position",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  internal_transfer: "Internal transfer",
  currency_exchange: "Currency exchange",
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
  balance_adjustment: "Balance adjustment",
  quantity_adjustment: "Quantity adjustment",
  other: "Other",
};

export const CASH_OPERATION_TYPES = [
  "deposit",
  "withdrawal",
  "interest",
  "fee",
  "tax",
] as const satisfies readonly PortfolioOperationType[];

export type CashOperationType =
  (typeof CASH_OPERATION_TYPES)[number];

export const CASH_OPERATION_TYPE_LABELS: Record<
  CashOperationType,
  string
> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
};

export const OPERATION_CURRENCIES = [
  "PLN",
  "USD",
  "EUR",
] as const;

export type OperationCurrency =
  (typeof OPERATION_CURRENCIES)[number];

export function isCashOperationType(
  value: string,
): value is CashOperationType {
  return (
    CASH_OPERATION_TYPES as readonly string[]
  ).includes(value);
}

export function isOperationCurrency(
  value: string,
): value is OperationCurrency {
  return (
    OPERATION_CURRENCIES as readonly string[]
  ).includes(value);
}