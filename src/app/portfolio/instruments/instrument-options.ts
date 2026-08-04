import type { Database } from "@/types/database.types";

export type InstrumentKind =
  Database["public"]["Enums"]["instrument_kind"];

export type InstrumentTrackingMode =
  Database["public"]["Enums"]["instrument_tracking_mode"];

export const INSTRUMENT_KINDS: InstrumentKind[] = [
  "stock",
  "etf",
  "reit",
  "crypto",
  "government_bond",
  "ppk_fund",
  "other",
];

export const INSTRUMENT_KIND_LABELS: Record<
  InstrumentKind,
  string
> = {
  stock: "Stock",
  etf: "ETF",
  reit: "REIT",
  crypto: "Cryptocurrency",
  government_bond: "Government bond",
  ppk_fund: "Employee Capital Plan fund (PPK)",
  other: "Other",
};

export const TRACKING_MODES: InstrumentTrackingMode[] = [
  "units",
  "balance",
];

export const TRACKING_MODE_LABELS: Record<
  InstrumentTrackingMode,
  string
> = {
  units: "Units and price",
  balance: "Reported balance",
};

export const INSTRUMENT_CURRENCIES = [
  "PLN",
  "USD",
  "EUR",
] as const;

export type InstrumentCurrency =
  (typeof INSTRUMENT_CURRENCIES)[number];

export function isInstrumentKind(
  value: string,
): value is InstrumentKind {
  return INSTRUMENT_KINDS.includes(value as InstrumentKind);
}

export function isTrackingMode(
  value: string,
): value is InstrumentTrackingMode {
  return TRACKING_MODES.includes(
    value as InstrumentTrackingMode,
  );
}

export function isInstrumentCurrency(
  value: string,
): value is InstrumentCurrency {
  return INSTRUMENT_CURRENCIES.includes(
    value as InstrumentCurrency,
  );
}