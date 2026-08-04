export const PROVIDER_TYPES = [
  "brokerage",
  "bank",
  "fund_manager",
  "crypto_platform",
  "other",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  brokerage: "Brokerage",
  bank: "Bank",
  fund_manager: "Fund manager",
  crypto_platform: "Crypto platform",
  other: "Other",
};

export function isProviderType(value: string): value is ProviderType {
  return PROVIDER_TYPES.includes(value as ProviderType);
}