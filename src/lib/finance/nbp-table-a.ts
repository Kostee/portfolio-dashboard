export type NbpTableARate = {
  currency: string;
  operationDate: string;
  rateDate: string;
  rateToBase: number;
  source: "NBP_A";
};

type NbpRateResponse = {
  code?: string;
  rates?: Array<{
    effectiveDate?: string;
    mid?: number;
  }>;
};

function shiftIsoDate(
  value: string,
  days: number,
): string {
  const parsed =
    new Date(
      `${value}T00:00:00Z`,
    );

  parsed.setUTCDate(
    parsed.getUTCDate() +
      days,
  );

  return parsed
    .toISOString()
    .slice(0, 10);
}

export async function fetchNbpTableARate(
  currency: string,
  operationDate: string,
  baseCurrency = "PLN",
): Promise<NbpTableARate> {
  const normalizedCurrency =
    currency.toUpperCase();

  const normalizedBase =
    baseCurrency.toUpperCase();

  if (normalizedBase !== "PLN") {
    throw new Error(
      `NBP Table A fallback supports PLN-base workspaces only, not ${normalizedBase}.`,
    );
  }

  if (
    normalizedCurrency !== "USD" &&
    normalizedCurrency !== "EUR"
  ) {
    throw new Error(
      `Unsupported NBP Table A currency: ${normalizedCurrency}.`,
    );
  }

  const startDate =
    shiftIsoDate(
      operationDate,
      -7,
    );

  const url =
    "https://api.nbp.pl/api/exchangerates/rates/a/" +
    `${normalizedCurrency}/${startDate}/${operationDate}/?format=json`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `NBP returned HTTP ${response.status} for ${normalizedCurrency}/${operationDate}.`,
    );
  }

  const payload =
    await response.json() as
      NbpRateResponse;

  const latest =
    (payload.rates ?? [])
      .filter(
        (rate) =>
          typeof rate.effectiveDate ===
            "string" &&
          typeof rate.mid ===
            "number" &&
          Number.isFinite(
            rate.mid,
          ) &&
          rate.mid > 0 &&
          rate.effectiveDate <=
            operationDate,
      )
      .sort(
        (
          first,
          second,
        ) =>
          (
            second.effectiveDate ??
            ""
          ).localeCompare(
            first.effectiveDate ??
              "",
          ),
      )[0];

  if (
    !latest?.effectiveDate ||
    !latest.mid
  ) {
    throw new Error(
      `No NBP Table A rate was available for ${normalizedCurrency} through ${operationDate}.`,
    );
  }

  return {
    currency:
      normalizedCurrency,
    operationDate,
    rateDate:
      latest.effectiveDate,
    rateToBase:
      latest.mid,
    source:
      "NBP_A",
  };
}
