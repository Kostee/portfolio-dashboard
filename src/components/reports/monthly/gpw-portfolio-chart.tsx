"use client";

import {
  useRef,
  useState,
} from "react";

import type {
  InstrumentChartItem,
} from "@/lib/reports/monthly-chart-data";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

type GpwPortfolioChartProps = {
  items: InstrumentChartItem[];
  totalValueBase: number;

  asOfDate: string;
  revision: number;
  baseCurrency: string;
};

const CHART_WIDTH = 1500;



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

function getOwnerHue(
  ownerKey: string,
): number {
  let hash = 0;

  for (const character of ownerKey) {
    hash =
      (
        hash * 31 +
        character.charCodeAt(0)
      ) >>> 0;
  }

  return hash % 360;
}

function getOwnerColor(
  ownerKey: string,
  itemIndex: number,
  itemCount: number,
): string {
  const hue =
    getOwnerHue(ownerKey);

  const progress =
    itemCount <= 1
      ? 0
      : itemIndex /
        (itemCount - 1);

  const lightness =
    Math.round(
      36 +
      progress * 34,
    );

  return `hsl(${hue} 60% ${lightness}%)`;
}
export function GpwPortfolioChart({
  items,
  totalValueBase,
  asOfDate,
  revision,
  baseCurrency,
}: GpwPortfolioChartProps) {
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

  const rowHeight = 56;
  const topMargin = 130;
  const bottomMargin = 105;
  const leftMargin = 410;
  const rightMargin = 260;

  const chartHeight =
    Math.max(
      700,
      topMargin +
        bottomMargin +
        items.length *
          rowHeight,
    );

  const plotWidth =
    CHART_WIDTH -
    leftMargin -
    rightMargin;

  const maximumValue =
    Math.max(
      ...items.map(
        (item) =>
          item.marketValueBase,
      ),
      1,
    );

  const axisMaximum =
    calculateAxisMaximum(
      maximumValue,
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
          `GPW_${asOfDate}.png`,
      });
    } catch (error) {
      console.error(
        "GPW chart export failed:",
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
          onClick={
            handleDownload
          }
          disabled={
            isDownloading
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
        >
          {isDownloading
            ? "Generating PNG…"
            : "Download GPW chart"}
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
          aria-label={`Polish stock portfolio structure as of ${asOfDate}`}
          data-monthly-report-chart="true"
          data-chart-order="1"
          data-chart-width={CHART_WIDTH}
          data-chart-height={chartHeight}
          data-chart-filename={`GPW_${asOfDate}.png`}
          data-report-revision={revision}
          className="block min-w-[900px] w-full"
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
            y={50}
            textAnchor="middle"
            fontSize={32}
            fontWeight={600}
            fill="#0f172a"
          >
            GPW portfolio structure:{" "}
            {formatAmount(
              totalValueBase,
            )}{" "}
            {baseCurrency} —{" "}
            {asOfDate}
          </text>

          <text
            x={CHART_WIDTH / 2}
            y={82}
            textAnchor="middle"
            fontSize={17}
            fill="#64748b"
          >
            Each owner receives a deterministic color gradient
          </text>

          {ticks.map(
            (tick) => {
              const x =
                leftMargin +
                (
                  tick /
                  axisMaximum
                ) *
                  plotWidth;

              return (
                <g
                  key={tick}
                >
                  <line
                    x1={x}
                    y1={
                      topMargin -
                      16
                    }
                    x2={x}
                    y2={
                      chartHeight -
                      bottomMargin
                    }
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="6 5"
                  />

                  <text
                    x={x}
                    y={
                      chartHeight -
                      bottomMargin +
                      34
                    }
                    textAnchor="middle"
                    fontSize={17}
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

          {items.map(
            (
              item,
              index,
            ) => {
              const y =
                topMargin +
                index *
                  rowHeight;

              const barWidth =
                Math.max(
                  2,
                  (
                    item.marketValueBase /
                    axisMaximum
                  ) *
                    plotWidth,
                );

              const ownerSegments =
                item.ownerBreakdown.length >
                0
                  ? item.ownerBreakdown
                  : [
                      {
                        ownerId:
                          "unknown",
                        ownerName:
                          "Unknown owner",
                        marketValueBase:
                          item.marketValueBase,
                        percentage: 100,
                      },
                    ];

              let accumulatedWidth =
                0;

              const label =
                `${item.instrumentName} [${formatQuantity(
                  item.quantity,
                )}]`;

              const valueLabel =
                `${formatAmount(
                  item.marketValueBase,
                )} ${baseCurrency} (${formatPercentage(
                  item.percentage,
                )}%)`;

              return (
                <g
                  key={
                    item.instrumentId
                  }
                >
                  <text
                    x={
                      leftMargin -
                      20
                    }
                    y={y + 23}
                    textAnchor="end"
                    fontSize={17}
                    fill="#0f172a"
                  >
                    {label}
                  </text>

                  {ownerSegments.map(
                    (
                      owner,
                      ownerIndex,
                    ) => {
                      const segmentWidth =
                        ownerIndex ===
                        ownerSegments.length -
                          1
                          ? Math.max(
                              0,
                              barWidth -
                                accumulatedWidth,
                            )
                          : Math.max(
                              0,
                              barWidth *
                                (
                                  owner.marketValueBase /
                                  Math.max(
                                    item.marketValueBase,
                                    0.00000001,
                                  )
                                ),
                            );

                      const segmentX =
                        leftMargin +
                        accumulatedWidth;

                      accumulatedWidth +=
                        segmentWidth;

                      const ownerColor =
                        getOwnerColor(
                           owner.ownerId,
                          index,
                          items.length,
                        );

                      const titleText =
                        `${owner.ownerName}: ${formatAmount(
                          owner.marketValueBase,
                        )} ${baseCurrency}`;

                      return (
                        <rect
                          key={
                            owner.ownerId
                          }
                          x={segmentX}
                          y={y}
                          width={
                            segmentWidth
                          }
                          height={32}
                          rx={
                            ownerSegments.length ===
                            1
                              ? 2
                              : 0
                          }
                          fill={ownerColor}
                        >
                          <title>
                            {titleText}
                          </title>
                        </rect>
                      );
                    },
                  )}

                  <text
                    x={
                      leftMargin +
                      barWidth +
                      14
                    }
                    y={y + 23}
                    fontSize={17}
                    fill="#1e293b"
                  >
                    {valueLabel}
                  </text>

                  <line
                    x1={leftMargin}
                    y1={y + 43}
                    x2={
                      CHART_WIDTH -
                      rightMargin
                    }
                    y2={y + 43}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                </g>
              );
            },
          )}

          <line
            x1={leftMargin}
            y1={
              chartHeight -
              bottomMargin
            }
            x2={
              CHART_WIDTH -
              rightMargin
            }
            y2={
              chartHeight -
              bottomMargin
            }
            stroke="#334155"
            strokeWidth={2}
          />

          <text
            x={
              leftMargin +
              plotWidth / 2
            }
            y={
              chartHeight -
              22
            }
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
