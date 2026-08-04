import type { Database } from "@/types/database.types";

export type AccountType =
  Database["public"]["Enums"]["account_type"];

export const ACCOUNT_TYPES: AccountType[] = [
  "brokerage_pln",
  "brokerage_foreign",
  "ike",
  "ikze",
  "oki",
  "ppk",
  "bonds",
  "crypto",
  "other",
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  brokerage_pln: "Brokerage account (PLN)",
  brokerage_foreign: "Brokerage account (foreign currency)",
  ike: "Individual Retirement Account (IKE)",
  ikze: "Individual Retirement Security Account (IKZE)",
  oki: "Personal Investment Account (OKI)",
  ppk: "Employee Capital Plan (PPK)",
  bonds: "Government bonds",
  crypto: "Crypto account",
  other: "Other",
};

export const ACCOUNT_CURRENCIES = [
  "PLN",
  "USD",
  "EUR",
] as const;

export type AccountCurrency =
  (typeof ACCOUNT_CURRENCIES)[number];

export function isAccountType(
  value: string,
): value is AccountType {
  return ACCOUNT_TYPES.includes(value as AccountType);
}

export function isAccountCurrency(
  value: string,
): value is AccountCurrency {
  return ACCOUNT_CURRENCIES.includes(
    value as AccountCurrency,
  );
}