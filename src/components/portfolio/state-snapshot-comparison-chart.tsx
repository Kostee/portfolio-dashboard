import type {
  StateSnapshotComparisonItem,
} from "@/lib/portfolio/state-snapshot-comparison";

type StateSnapshotComparisonChartProps = {
  title: string;
  description: string;
  items: StateSnapshotComparisonItem[];
  baselineDate: string | null;
  baseCurrency: string;
  groupByAssetClass?: boolean;
};

function formatAmount(
  value: number,
): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(
  value: number,
): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatQuantityDelta(
  value: number,
): string {
  if (Math.abs(value) < 0.00000001) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${formatQuantity(
    value,
  )}`;
}

function withOpacity(
  hex: string,
  alpha: string,
): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
    ? `${hex}${alpha}`
    : hex;
}

function ComparisonRow({
  item,
  maximumValue,
  baseCurrency,
}: {
  item: StateSnapshotComparisonItem;
  maximumValue: number;
  baseCurrency: string;
}) {
  const scale =
    maximumValue > 0
      ? 100 / maximumValue
      : 0;

  const retainedWidth =
    item.retainedValue * scale;
  const addedWidth =
    item.addedValue * scale;
  const removedWidth =
    item.removedValue * scale;

  const currentEnd =
    item.currentComparableValue * scale;
  const baselineEnd =
    item.baselineComparableValue * scale;

  const label =
    item.instrumentTicker ??
    item.instrumentName;

  const deltaClass =
    item.quantityDelta > 0
      ? "text-emerald-700"
      : item.quantityDelta < 0
        ? "text-rose-700"
        : "text-slate-500";

  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">
              {label}
            </p>

            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  item.assetClassColor,
              }}
              aria-hidden="true"
            />

            <span className={`text-xs font-semibold ${deltaClass}`}>
              {formatQuantityDelta(
                item.quantityDelta,
              )}{" "}
              units
            </span>
          </div>

          {item.instrumentTicker && (
            <p className="mt-1 text-xs text-slate-500">
              {item.instrumentName}
            </p>
          )}
        </div>

        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-slate-900">
            {item.currentQuantity <= 0 &&
            item.baselineQuantity > 0
              ? "Closed"
              : item.currentEstimatedBaseValue ===
                  null
                ? "No current value"
                : `${formatAmount(
                    item.currentEstimatedBaseValue,
                  )} ${baseCurrency}`}
          </p>

          <p className="mt-0.5 text-[11px] text-slate-500">
            {formatQuantity(
              item.baselineQuantity,
            )}{" "}
            →{" "}
            {formatQuantity(
              item.currentQuantity,
            )}{" "}
            units
          </p>
        </div>
      </div>

      <div className="relative mt-2 h-6 overflow-hidden rounded-md bg-slate-100">
        {retainedWidth > 0 && (
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${retainedWidth}%`,
              backgroundColor:
                item.assetClassColor,
            }}
            title="Quantity retained from the monthly baseline"
          />
        )}

        {addedWidth > 0 && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${retainedWidth}%`,
              width: `${addedWidth}%`,
              backgroundColor: withOpacity(
                item.assetClassColor,
                "66",
              ),
            }}
            title="Quantity added since the monthly baseline"
          />
        )}

        {removedWidth > 0 && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${retainedWidth}%`,
              width: `${removedWidth}%`,
              backgroundImage:
                `repeating-linear-gradient(135deg, ${withOpacity(
                  item.assetClassColor,
                  "80",
                )} 0 5px, transparent 5px 10px)`,
              backgroundColor:
                "rgba(255,255,255,0.72)",
              borderLeft:
                "1px solid rgba(100,116,139,0.35)",
            }}
            title="Quantity removed since the monthly baseline"
          />
        )}

        <div
          className="absolute bottom-0 top-0 w-px bg-slate-900/55"
          style={{
            left: `${Math.min(
              100,
              baselineEnd,
            )}%`,
          }}
          title="Monthly baseline"
        />

        {Math.abs(
          currentEnd - baselineEnd,
        ) > 0.05 && (
          <div
            className="absolute bottom-0 top-0 w-px bg-white/80"
            style={{
              left: `${Math.min(
                100,
                currentEnd,
              )}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export function StateSnapshotComparisonChart({
  title,
  description,
  items,
  baselineDate,
  baseCurrency,
  groupByAssetClass = false,
}: StateSnapshotComparisonChartProps) {
  if (!baselineDate) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          {description}
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="font-medium text-slate-800">
            No monthly baseline yet
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Generate a monthly report first. The
            current-state comparison will then use
            its frozen instrument quantities as the
            baseline.
          </p>
        </div>
      </section>
    );
  }

  const maximumValue =
    Math.max(
      1,
      ...items.map((item) =>
        Math.max(
          item.currentComparableValue,
          item.baselineComparableValue,
        ),
      ),
    ) * 1.03;

  const groups = groupByAssetClass
    ? Array.from(
        items.reduce(
          (map, item) => {
            const key =
              item.assetClassCode ??
              item.assetClassName;

            const existing =
              map.get(key) ?? {
                name: item.assetClassName,
                color:
                  item.assetClassColor,
                sortOrder:
                  item.assetClassSortOrder,
                items: [] as StateSnapshotComparisonItem[],
              };

            existing.items.push(item);
            map.set(key, existing);
            return map;
          },
          new Map<
            string,
            {
              name: string;
              color: string;
              sortOrder: number;
              items: StateSnapshotComparisonItem[];
            }
          >(),
        ).values(),
      ).sort(
        (first, second) =>
          first.sortOrder -
            second.sortOrder ||
          first.name.localeCompare(
            second.name,
          ),
      )
    : [
        {
          name: "",
          color: "",
          sortOrder: 0,
          items,
        },
      ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          baseline {baselineDate}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-7 rounded bg-slate-500" />
          retained
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-7 rounded bg-slate-300" />
          added
        </span>

        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-7 rounded border border-slate-300"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(100,116,139,.65) 0 3px, transparent 3px 6px)",
            }}
          />
          removed
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-px bg-slate-900/60" />
          monthly quantity
        </span>
      </div>

      {items.length > 0 ? (
        <div className="mt-4">
          {groups.map((group) => (
            <div
              key={
                group.name ||
                "all-instruments"
              }
              className="[&+&]:mt-5"
            >
              {groupByAssetClass && (
                <div className="mb-1 flex items-center gap-2 border-b border-slate-200 pb-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        group.color,
                    }}
                  />

                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                    {group.name}
                  </h3>
                </div>
              )}

              {group.items.map((item) => (
                <ComparisonRow
                  key={item.instrumentId}
                  item={item}
                  maximumValue={
                    maximumValue
                  }
                  baseCurrency={
                    baseCurrency
                  }
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          No instruments from this chart are
          present in either the latest monthly
          baseline or the current ledger.
        </div>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
        The comparison isolates holding changes:
        when a current unit value is available,
        the frozen monthly quantity is repriced at
        that same current unit value. Closed
        positions fall back to their frozen monthly
        value. No extra chart history is stored.
      </p>
    </section>
  );
}
