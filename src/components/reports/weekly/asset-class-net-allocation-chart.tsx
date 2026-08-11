"use client";

import {
  useRef,
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

import type {
  WeeklyAssetClassChartItem,
} from "@/lib/reports/weekly-operation-chart-data";

type AssetClassNetAllocationChartProps = {
  items:
    WeeklyAssetClassChartItem[];

  fromDate: string;
  toDate: string;

  baseCurrency: string;

  netTradingBase: number;
  externalContributionsBase: number;
};

type Point = {
  x: number;
  y: number;
};

const CHART_WIDTH =
  1500;

const CHART_HEIGHT =
  1000;

const CENTER_X =
  470;

const CENTER_Y =
  500;

const RADIUS =
  300;

function formatAmount(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

function reportDateLabel(
  fromDate: string,
  toDate: string,
): string {
  return fromDate ===
    toDate
    ? fromDate
    : `${fromDate} → ${toDate}`;
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
): Point {
  const angleInRadians =
    (
      angleInDegrees -
      90
    ) *
    Math.PI /
    180;

  return {
    x:
      centerX +
      radius *
        Math.cos(
          angleInRadians,
        ),

    y:
      centerY +
      radius *
        Math.sin(
          angleInRadians,
        ),
  };
}

function describePieSegment(
  startAngle: number,
  endAngle: number,
): string {
  const safeEndAngle =
    Math.min(
      endAngle,
      startAngle +
        359.999,
    );

  const start =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      RADIUS,
      startAngle,
    );

  const end =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      RADIUS,
      safeEndAngle,
    );

  const largeArcFlag =
    safeEndAngle -
      startAngle >
    180
      ? 1
      : 0;

  return [
    `M ${CENTER_X} ${CENTER_Y}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

export function AssetClassNetAllocationChart({
  items,
  fromDate,
  toDate,
  baseCurrency,
  netTradingBase,
  externalContributionsBase,
}: AssetClassNetAllocationChartProps) {
  const svgRef =
    useRef<SVGSVGElement>(
      null,
    );

  const [
    isDownloading,
    setIsDownloading,
  ] =
    useState(false);

  const [
    downloadError,
    setDownloadError,
  ] =
    useState<
      string | null
    >(null);

  const positiveItems =
    items.filter(
      (item) =>
        item.netValueBase >
        0,
    );

  const negativeItems =
    items.filter(
      (item) =>
        item.netValueBase <
        0,
    );

  const positiveTotal =
    positiveItems.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.netValueBase,
      0,
    );

  const positiveSegments =
    positiveItems.map(
        (item, index) => {
        const precedingValue =
            positiveItems
            .slice(
                0,
                index,
            )
            .reduce(
                (
                sum,
                precedingItem,
                ) =>
                sum +
                precedingItem.netValueBase,
                0,
            );

        const startAngle =
            positiveTotal > 0
            ? (
                precedingValue /
                positiveTotal
                ) *
                360
            : 0;

        const endAngle =
            positiveTotal > 0
            ? (
                (
                    precedingValue +
                    item.netValueBase
                ) /
                positiveTotal
                ) *
                360
            : 0;

        return {
            item,
            startAngle,
            endAngle,
        };
      },
    );

    const negativeSegments =
    negativeItems.map(
        (item, index) => {
        const precedingMagnitude =
            negativeItems
            .slice(
                0,
                index,
            )
            .reduce(
                (
                sum,
                precedingItem,
                ) =>
                sum +
                Math.abs(
                    precedingItem.netValueBase,
                ),
                0,
            );

        const currentMagnitude =
            Math.abs(
            item.netValueBase,
            );

        const startAngle =
            netTradingBase > 0
            ? Math.min(
                (
                    precedingMagnitude /
                    netTradingBase
                ) *
                    360,
                359.999,
                )
            : 0;

        const endAngle =
            netTradingBase > 0
            ? Math.min(
                (
                    (
                    precedingMagnitude +
                    currentMagnitude
                    ) /
                    netTradingBase
                ) *
                    360,
                359.999,
                )
            : 0;

        return {
            item,
            startAngle,
            endAngle,
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

        width:
          CHART_WIDTH,

        height:
          CHART_HEIGHT,

        filename:
          `WEEKLY_ASSET_CLASSES_${fromDate}_${toDate}.png`,
      });
    } catch (error) {
      console.error(
        "Weekly asset-class chart export failed:",
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
          Positive net classes
          form the pie. Negative
          classes are shown as
          striped overlays.
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
            : "Download asset-class chart"}
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
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`Net asset-class trading allocation ${fromDate} to ${toDate}`}
          data-weekly-report-chart="true"
          data-chart-order="2"
          data-chart-width={
            CHART_WIDTH
          }
          data-chart-height={
            CHART_HEIGHT
          }
          data-chart-filename={`WEEKLY_ASSET_CLASSES_${fromDate}_${toDate}.png`}
          className="block min-w-[1000px] w-full"
        >
          <rect
            width={
              CHART_WIDTH
            }
            height={
              CHART_HEIGHT
            }
            fill="#ffffff"
          />

          <style>
            {`
              text {
                font-family: Arial, Helvetica, sans-serif;
              }
            `}
          </style>

          <defs>
            {negativeItems.map(
              (
                item,
                index,
              ) => (
                <pattern
                  key={
                    item.assetClassId ??
                    item.assetClassName
                  }
                  id={`weekly-negative-hatch-${index}`}
                  patternUnits="userSpaceOnUse"
                  width="12"
                  height="12"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="12"
                    stroke={
                      item.assetClassColor
                    }
                    strokeWidth="4"
                  />
                </pattern>
              ),
            )}
          </defs>

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={48}
            textAnchor="middle"
            fontSize={31}
            fontWeight={600}
            fill="#0f172a"
          >
            Net new assets by
            asset class —{" "}
            {reportDateLabel(
              fromDate,
              toDate,
            )}
          </text>

          {positiveSegments.length >
          0 ? (
            <>
              {positiveSegments.map(
                ({
                  item,
                  startAngle,
                  endAngle,
                }) => (
                  <path
                    key={
                      item.assetClassId ??
                      item.assetClassName
                    }
                    d={describePieSegment(
                      startAngle,
                      endAngle,
                    )}
                    fill={
                      item.assetClassColor
                    }
                    stroke="#ffffff"
                    strokeWidth={4}
                  >
                    <title>
                      {
                        item.assetClassName
                      }
                      {": "}
                      {formatAmount(
                        item.netValueBase,
                      )}{" "}
                      {
                        baseCurrency
                      }
                      {" · "}
                      {formatPercentage(
                        item.percentageOfNet,
                      )}
                      %
                    </title>
                  </path>
                ),
              )}

              {negativeSegments.map(
                (
                  {
                    item,
                    startAngle,
                    endAngle,
                  },
                  index,
                ) => (
                  <path
                    key={`negative-${
                      item.assetClassId ??
                      item.assetClassName
                    }`}
                    d={describePieSegment(
                      startAngle,
                      endAngle,
                    )}
                    fill={`url(#weekly-negative-hatch-${index})`}
                    stroke={
                      item.assetClassColor
                    }
                    strokeWidth={2}
                  >
                    <title>
                      {
                        item.assetClassName
                      }
                      {": −"}
                      {formatAmount(
                        Math.abs(
                          item.netValueBase,
                        ),
                      )}{" "}
                      {
                        baseCurrency
                      }
                      {" · "}
                      {formatPercentage(
                        item.percentageOfNet,
                      )}
                      %
                    </title>
                  </path>
                ),
              )}
            </>
          ) : (
            <text
              x={
                CENTER_X
              }
              y={
                CENTER_Y
              }
              textAnchor="middle"
              fontSize={22}
              fill="#64748b"
            >
              No positive net
              asset classes
            </text>
          )}

          <text
            x={875}
            y={155}
            fontSize={20}
            fontWeight={700}
            fill="#0f172a"
          >
            Net allocation
          </text>

          {items.map(
            (
              item,
              index,
            ) => {
              const rowY =
                205 +
                index *
                  92;

              const isNegative =
                item.netValueBase <
                0;

              const negativeIndex =
                negativeItems.findIndex(
                  (
                    negative,
                  ) =>
                    negative.assetClassId ===
                      item.assetClassId &&
                    negative.assetClassName ===
                      item.assetClassName,
                );

              return (
                <g
                  key={
                    item.assetClassId ??
                    item.assetClassName
                  }
                >
                  {isNegative ? (
                    <rect
                      x={875}
                      y={
                        rowY -
                        20
                      }
                      width={25}
                      height={25}
                      fill={`url(#weekly-negative-hatch-${negativeIndex})`}
                      stroke={
                        item.assetClassColor
                      }
                      strokeWidth={2}
                    />
                  ) : (
                    <rect
                      x={875}
                      y={
                        rowY -
                        20
                      }
                      width={25}
                      height={25}
                      rx={4}
                      fill={
                        item.assetClassColor
                      }
                    />
                  )}

                  <text
                    x={920}
                    y={
                      rowY -
                      2
                    }
                    fontSize={19}
                    fontWeight={600}
                    fill="#0f172a"
                  >
                    {
                      item.assetClassName
                    }
                  </text>

                  <text
                    x={920}
                    y={
                      rowY +
                      27
                    }
                    fontSize={17}
                    fill="#475569"
                  >
                    {item.netValueBase <
                    0
                      ? "−"
                      : ""}
                    {formatAmount(
                      Math.abs(
                        item.netValueBase,
                      ),
                    )}{" "}
                    {
                      baseCurrency
                    }
                  </text>

                  <text
                    x={1390}
                    y={
                      rowY -
                      2
                    }
                    textAnchor="end"
                    fontSize={20}
                    fontWeight={700}
                    fill={
                      isNegative
                        ? "#b45309"
                        : "#0f172a"
                    }
                  >
                    {formatPercentage(
                      item.percentageOfNet,
                    )}
                    %
                  </text>

                  <text
                    x={1390}
                    y={
                      rowY +
                      27
                    }
                    textAnchor="end"
                    fontSize={15}
                    fill="#64748b"
                  >
                    {
                      item.instrumentCount
                    }{" "}
                    {item.instrumentCount ===
                    1
                      ? "instrument"
                      : "instruments"}
                  </text>
                </g>
              );
            },
          )}

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={936}
            textAnchor="middle"
            fontSize={17}
            fill="#475569"
          >
            Net trading
            balance:{" "}
            {formatAmount(
              netTradingBase,
            )}{" "}
            {baseCurrency}
            {"   |   "}
            External
            contributions:{" "}
            {formatAmount(
              externalContributionsBase,
            )}{" "}
            {baseCurrency}
          </text>

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={968}
            textAnchor="middle"
            fontSize={15}
            fill="#64748b"
          >
            Percentages use
            total net trading
            balance. Stripes
            mark negative
            asset-class net
            activity.
          </text>
        </svg>
      </div>
    </div>
  );
}