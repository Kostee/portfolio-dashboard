export const STATE_FOREIGN_ASSET_CLASS_CODES = [
  "global_etfs",
  "us_reits",
  "semiconductor_stocks",
] as const;

export type StateComparisonCurrentInstrument = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;
  quantity: number;
  estimatedBaseValue: number | null;
  comparisonUnitBaseValue: number | null;
};

export type StateComparisonBaselineItem = {
  instrument_id: string | null;
  instrument_name: string | null;
  instrument_ticker: string | null;
  asset_class_name: string | null;
  asset_class_code: string | null;
  asset_class_color: string | null;
  asset_class_sort_order: number | null;
  quantity: number | string | null;
  market_value_base: number | string | null;
};

export type StateSnapshotComparisonItem = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;
  baselineQuantity: number;
  currentQuantity: number;
  quantityDelta: number;
  baselineComparableValue: number;
  currentComparableValue: number;
  retainedValue: number;
  addedValue: number;
  removedValue: number;
  currentEstimatedBaseValue: number | null;
  comparisonUsesCurrentUnitValue: boolean;
  status: "added" | "reduced" | "unchanged" | "closed";
};

const FALLBACK_ASSET_CLASS_COLOR = "#64748b";

function toFiniteNumber(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildStateSnapshotComparison({
  current,
  baseline,
}: {
  current: StateComparisonCurrentInstrument[];
  baseline: StateComparisonBaselineItem[];
}): StateSnapshotComparisonItem[] {
  const currentByInstrument = new Map(
    current.map((item) => [
      item.instrumentId,
      item,
    ]),
  );

  const baselineByInstrument = new Map<
    string,
    {
      instrumentId: string;
      instrumentName: string;
      instrumentTicker: string | null;
      assetClassName: string;
      assetClassCode: string | null;
      assetClassColor: string;
      assetClassSortOrder: number;
      quantity: number;
      marketValueBase: number;
    }
  >();

  for (const item of baseline) {
    if (!item.instrument_id) {
      continue;
    }

    const quantity = toFiniteNumber(item.quantity);
    const marketValueBase =
      toFiniteNumber(item.market_value_base);

    const existing =
      baselineByInstrument.get(item.instrument_id);

    if (existing) {
      existing.quantity += quantity;
      existing.marketValueBase += marketValueBase;
      continue;
    }

    baselineByInstrument.set(item.instrument_id, {
      instrumentId: item.instrument_id,
      instrumentName:
        item.instrument_name ?? "Unknown instrument",
      instrumentTicker: item.instrument_ticker,
      assetClassName:
        item.asset_class_name ?? "Unclassified",
      assetClassCode: item.asset_class_code,
      assetClassColor:
        item.asset_class_color ??
        FALLBACK_ASSET_CLASS_COLOR,
      assetClassSortOrder:
        item.asset_class_sort_order ?? 999,
      quantity,
      marketValueBase,
    });
  }

  const instrumentIds = new Set([
    ...currentByInstrument.keys(),
    ...baselineByInstrument.keys(),
  ]);

  const result: StateSnapshotComparisonItem[] = [];

  for (const instrumentId of instrumentIds) {
    const currentItem =
      currentByInstrument.get(instrumentId);
    const baselineItem =
      baselineByInstrument.get(instrumentId);

    const currentQuantity =
      currentItem?.quantity ?? 0;
    const baselineQuantity =
      baselineItem?.quantity ?? 0;
    const quantityDelta =
      currentQuantity - baselineQuantity;

    const currentEstimatedBaseValue =
      currentItem?.estimatedBaseValue ?? null;

    const currentUnitBaseValue =
      currentItem?.comparisonUnitBaseValue ??
      (
        currentEstimatedBaseValue !== null &&
        currentQuantity > 0
          ? currentEstimatedBaseValue / currentQuantity
          : null
      );

    const comparisonUsesCurrentUnitValue =
      currentUnitBaseValue !== null;

    const baselineComparableValue =
      currentUnitBaseValue !== null
        ? Math.max(0, baselineQuantity) *
          currentUnitBaseValue
        : Math.max(
            0,
            baselineItem?.marketValueBase ?? 0,
          );

    const currentComparableValue =
      currentUnitBaseValue !== null
        ? Math.max(0, currentQuantity) *
          currentUnitBaseValue
        : Math.max(
            0,
            currentEstimatedBaseValue ?? 0,
          );

    const retainedQuantity = Math.max(
      0,
      Math.min(
        baselineQuantity,
        currentQuantity,
      ),
    );

    const retainedValue =
      currentUnitBaseValue !== null
        ? retainedQuantity *
          currentUnitBaseValue
        : Math.min(
            baselineComparableValue,
            currentComparableValue,
          );

    const addedValue = Math.max(
      0,
      currentComparableValue - retainedValue,
    );

    const removedValue = Math.max(
      0,
      baselineComparableValue - retainedValue,
    );

    const status: StateSnapshotComparisonItem["status"] =
      baselineQuantity <= 0 && currentQuantity > 0
        ? "added"
        : baselineQuantity > 0 && currentQuantity <= 0
          ? "closed"
          : quantityDelta > 0
            ? "added"
            : quantityDelta < 0
              ? "reduced"
              : "unchanged";

    result.push({
      instrumentId,
      instrumentName:
        currentItem?.instrumentName ??
        baselineItem?.instrumentName ??
        "Unknown instrument",
      instrumentTicker:
        currentItem?.instrumentTicker ??
        baselineItem?.instrumentTicker ??
        null,
      assetClassName:
        currentItem?.assetClassName ??
        baselineItem?.assetClassName ??
        "Unclassified",
      assetClassCode:
        currentItem?.assetClassCode ??
        baselineItem?.assetClassCode ??
        null,
      assetClassColor:
        currentItem?.assetClassColor ??
        baselineItem?.assetClassColor ??
        FALLBACK_ASSET_CLASS_COLOR,
      assetClassSortOrder:
        currentItem?.assetClassSortOrder ??
        baselineItem?.assetClassSortOrder ??
        999,
      baselineQuantity,
      currentQuantity,
      quantityDelta,
      baselineComparableValue,
      currentComparableValue,
      retainedValue,
      addedValue,
      removedValue,
      currentEstimatedBaseValue,
      comparisonUsesCurrentUnitValue,
      status,
    });
  }

  return result.sort((first, second) => {
    const firstDisplayValue = Math.max(
      first.currentComparableValue,
      first.baselineComparableValue,
    );
    const secondDisplayValue = Math.max(
      second.currentComparableValue,
      second.baselineComparableValue,
    );

    return (
      first.assetClassSortOrder -
        second.assetClassSortOrder ||
      secondDisplayValue - firstDisplayValue ||
      (
        first.instrumentTicker ??
        first.instrumentName
      ).localeCompare(
        second.instrumentTicker ??
          second.instrumentName,
      )
    );
  });
}
