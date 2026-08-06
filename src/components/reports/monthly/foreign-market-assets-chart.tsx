"use client";

import {
  useRef,
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

import type {
  MonthlyChartData,
} from "@/lib/reports/monthly-chart-data";

type ForeignMarketAssetsChartProps = {
  groups:
    MonthlyChartData["foreign"]["groups"];

  totalValueBase: number;

  asOfDate: string;
  revision: number;
  baseCurrency: string;
};

const CHART_WIDTH = 1600;

const TOP_MARGIN = 135;
const BOTTOM_MARGIN = 100;

const LEFT_MARGIN = 390;
const RIGHT_MARGIN = 355;

const GROUP_HEADER_HEIGHT = 68;
const GROUP_GAP = 28;
const ROW_HEIGHT = 58;

function formatAmount(
  value: number,
  fractionDigits = 0,
): string {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      minimumFractionDigits:
        fractionDigits,

      maximumFractionDigits:
        fractionDigits,
    },
  ).format(value);
}

function formatQuantity(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    },
  ).format(value);
}

function formatPercentage(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(value);
}

function calculateAxisMaximum(
  value: number,
): number {
  if (value <= 0) {
    return 1;
  }

  const exponent =
    Math.floor(
      Math.log10(value),
    );

  const magnitude =
    10 ** exponent;

  const fraction =
    value / magnitude;

  let niceFraction: number;

  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 1.25) {
    niceFraction = 1.25;
  } else if (fraction <= 1.5) {
    niceFraction = 1.5;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 2.5) {
    niceFraction = 2.5;
  } else if (fraction <= 3) {
    niceFraction = 3;
  } else if (fraction <= 4) {
    niceFraction = 4;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else if (fraction <= 6) {
    niceFraction = 6;
  } else if (fraction <= 7.5) {
    niceFraction = 7.5;
  } else {
    niceFraction = 10;
  }

  return niceFraction * magnitude;
}

export function ForeignMarketAssetsChart({
  groups,
  totalValueBase,
  asOfDate,
  revision,
  baseCurrency,
}: ForeignMarketAssetsChartProps) {
  const svgRef =
    useRef<SVGSVGElement>(
      null,
    );

  const [
    isDownloading,
    setIsDownloading,
  ] = useState(false);

  const [
    downloadError,
    setDownloadError,
  ] = useState<
    string | null
  >(null);

  const itemCount =
    groups.reduce(
      (sum, group) =>
        sum +
        group.items.length,
      0,
    );

  const contentHeight =
    groups.reduce(
      (sum, group) =>
        sum +
        GROUP_HEADER_HEIGHT +
        group.items.length *
          ROW_HEIGHT +
        GROUP_GAP,
      0,
    );

  const chartHeight =
    Math.max(
      850,
      TOP_MARGIN +
        BOTTOM_MARGIN +
        contentHeight,
    );

  const plotWidth =
    CHART_WIDTH -
    LEFT_MARGIN -
    RIGHT_MARGIN;

  const maximumValue =
    Math.max(
      ...groups.flatMap(
        (group) =>
          group.items.map(
            (item) =>
              item.marketValueBase,
          ),
      ),
      1,
    );

  const axisMaximum =
    calculateAxisMaximum(
      maximumValue * 1.05,
    );

  const tickCount = 6;

  const ticks =
    Array.from(
      {
        length:
          tickCount + 1,
      },
      (_, index) =>
        (
          axisMaximum *
          index
        ) / tickCount,
    );

  const groupLayouts =
    groups.map(
      (
        group,
        groupIndex,
      ) => {
        const precedingHeight =
          groups
            .slice(
              0,
              groupIndex,
            )
            .reduce(
              (
                sum,
                precedingGroup,
              ) =>
                sum +
                GROUP_HEADER_HEIGHT +
                precedingGroup
                  .items.length *
                  ROW_HEIGHT +
                GROUP_GAP,
              0,
            );

        const headerY =
          TOP_MARGIN +
          precedingHeight;

        const itemsStartY =
          headerY +
          GROUP_HEADER_HEIGHT;

        return {
          group,
          headerY,
          itemsStartY,
        };
      },
    );

  async function handleDownload() {
    const svg =
      svgRef.current;

    if (!svg) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      await exportSvgAsPng({
        svg,

        width: CHART_WIDTH,
        height: chartHeight,

        filename:
          `FOREIGN_ASSETS_${asOfDate}_revision-${revision}.png`,
      });
    } catch (error) {
      console.error(
        "Foreign-market chart export failed:",
        error,
      );

      setDownloadError(
        "The PNG file could not be generated.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          PNG resolution:{" "}
          {CHART_WIDTH * 2} ×{" "}
          {chartHeight * 2}
        </p>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
        >
          {isDownloading
            ? "Generating PNG…"
            : "Download foreign-assets chart"}
        </button>
      </div>

      {downloadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {downloadError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
          role="img"
          aria-label={`Foreign-market assets as of ${asOfDate}`}
          className="block min-w-[950px] w-full"
        >
          <rect
            width={CHART_WIDTH}
            height={chartHeight}
            fill="#ffffff"
          />

          <style>
            {`
              text {
                font-family: Arial, Helvetica, sans-serif;
              }
            `}
          </style>

          <text
            x={CHART_WIDTH / 2}
            y={48}
            textAnchor="middle"
            fontSize={32}
            fontWeight={600}
            fill="#0f172a"
          >
            Foreign-market assets:{" "}
            {formatAmount(
              totalValueBase,
            )}{" "}
            {baseCurrency}
          </text>

          <text
            x={CHART_WIDTH / 2}
            y={82}
            textAnchor="middle"
            fontSize={17}
            fill="#64748b"
          >
            Global ETFs · U.S. REITs ·
            semiconductor stocks ·{" "}
            {asOfDate} · revision{" "}
            {revision}
          </text>

          <text
            x={CHART_WIDTH / 2}
            y={108}
            textAnchor="middle"
            fontSize={15}
            fill="#94a3b8"
          >
            Each instrument is displayed
            separately · cash excluded ·{" "}
            {itemCount}{" "}
            {itemCount === 1
              ? "position"
              : "positions"}
          </text>

          {ticks.map(
            (tick) => {
              const x =
                LEFT_MARGIN +
                (
                  tick /
                  axisMaximum
                ) *
                  plotWidth;

              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={TOP_MARGIN}
                    x2={x}
                    y2={
                      chartHeight -
                      BOTTOM_MARGIN
                    }
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="6 5"
                  />

                  <text
                    x={x}
                    y={
                      chartHeight -
                      BOTTOM_MARGIN +
                      34
                    }
                    textAnchor="middle"
                    fontSize={16}
                    fill="#475569"
                  >
                    {formatAmount(
                      tick,
                    )}{" "}
                    {baseCurrency}
                  </text>
                </g>
              );
            },
          )}

          {groupLayouts.map(
            ({
              group,
              headerY,
              itemsStartY,
            }) => (
              <g
                key={
                  group.assetClassCode ??
                  group.assetClassName
                }
              >
                <rect
                  x={70}
                  y={headerY + 4}
                  width={
                    CHART_WIDTH -
                    140
                  }
                  height={48}
                  rx={10}
                  fill="#f8fafc"
                  stroke="#e2e8f0"
                />

                <rect
                  x={92}
                  y={headerY + 17}
                  width={22}
                  height={22}
                  rx={4}
                  fill={
                    group.assetClassColor
                  }
                />

                <text
                  x={130}
                  y={headerY + 34}
                  fontSize={20}
                  fontWeight={700}
                  fill="#0f172a"
                >
                  {group.assetClassName}
                </text>

                <text
                  x={CHART_WIDTH - 92}
                  y={headerY + 34}
                  textAnchor="end"
                  fontSize={18}
                  fontWeight={600}
                  fill="#334155"
                >
                  {formatAmount(
                    group.marketValueBase,
                  )}{" "}
                  {baseCurrency}
                  {" · "}
                  {formatPercentage(
                    group.percentage,
                  )}
                  %
                </text>

                {group.items.map(
                  (
                    item,
                    itemIndex,
                  ) => {
                    const rowY =
                      itemsStartY +
                      itemIndex *
                        ROW_HEIGHT;

                    const barWidth =
                      Math.max(
                        2,
                        (
                          item.marketValueBase /
                          axisMaximum
                        ) *
                          plotWidth,
                      );

                    const label =
                      item.instrumentTicker
                        ? `${item.instrumentTicker} [${formatQuantity(
                            item.quantity,
                          )}]`
                        : `${item.instrumentName} [${formatQuantity(
                            item.quantity,
                          )}]`;

                    const valueLabel =
                      `${formatAmount(
                        item.marketValueBase,
                      )} ${baseCurrency} (${formatPercentage(
                        item.percentage,
                      )}%)`;

                    const originalValueLabel =
                      `${formatAmount(
                        item.marketValue,
                        2,
                      )} ${item.currency}`;

                    return (
                      <g
                        key={
                          item.instrumentId
                        }
                      >
                        <text
                          x={
                            LEFT_MARGIN -
                            18
                          }
                          y={rowY + 23}
                          textAnchor="end"
                          fontSize={17}
                          fontWeight={600}
                          fill="#0f172a"
                        >
                          {label}
                        </text>

                        <rect
                          x={LEFT_MARGIN}
                          y={rowY}
                          width={barWidth}
                          height={32}
                          rx={3}
                          fill={
                            group.assetClassColor
                          }
                          fillOpacity={
                            Math.max(
                              0.55,
                              1 -
                                itemIndex *
                                  0.04,
                            )
                          }
                        />

                        <text
                          x={
                            LEFT_MARGIN +
                            barWidth +
                            14
                          }
                          y={rowY + 18}
                          fontSize={16}
                          fontWeight={600}
                          fill="#1e293b"
                        >
                          {valueLabel}
                        </text>

                        <text
                          x={
                            LEFT_MARGIN +
                            barWidth +
                            14
                          }
                          y={rowY + 39}
                          fontSize={14}
                          fill="#64748b"
                        >
                          {originalValueLabel}
                        </text>

                        <line
                          x1={LEFT_MARGIN}
                          y1={rowY + 48}
                          x2={
                            CHART_WIDTH -
                            RIGHT_MARGIN
                          }
                          y2={rowY + 48}
                          stroke="#e2e8f0"
                          strokeWidth={1}
                        >
                          <title>
                            {item.instrumentName}
                          </title>
                        </line>
                      </g>
                    );
                  },
                )}
              </g>
            ),
          )}

          <line
            x1={LEFT_MARGIN}
            y1={
              chartHeight -
              BOTTOM_MARGIN
            }
            x2={
              CHART_WIDTH -
              RIGHT_MARGIN
            }
            y2={
              chartHeight -
              BOTTOM_MARGIN
            }
            stroke="#334155"
            strokeWidth={2}
          />

          <text
            x={
              LEFT_MARGIN +
              plotWidth / 2
            }
            y={chartHeight - 24}
            textAnchor="middle"
            fontSize={20}
            fill="#0f172a"
          >
            Position value (
            {baseCurrency})
          </text>
        </svg>
      </div>
    </div>
  );
}