"use client";

import {
  useRef,
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

import type {
  WeeklyInstrumentChartItem,
} from "@/lib/reports/weekly-operation-chart-data";

type InstrumentNetTradesChartProps = {
  items:
    WeeklyInstrumentChartItem[];

  fromDate: string;
  toDate: string;

  baseCurrency: string;

  boughtBase: number;
  soldBase: number;
  netTradingBase: number;

  externalContributionsBase: number;
};

const CHART_WIDTH =
  1600;

const CENTER_X =
  820;

const PLOT_HALF_WIDTH =
  500;

const ROW_HEIGHT =
  82;

const TOP =
  175;

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

function formatQuantity(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      maximumFractionDigits: 8,
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

export function InstrumentNetTradesChart({
  items,
  fromDate,
  toDate,
  baseCurrency,
  boughtBase,
  soldBase,
  netTradingBase,
  externalContributionsBase,
}: InstrumentNetTradesChartProps) {
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

  const chartHeight =
    Math.max(
      800,
      TOP +
        items.length *
          ROW_HEIGHT +
        150,
    );

  const maxAbsoluteValue =
    Math.max(
      1,
      ...items.map(
        (item) =>
          Math.abs(
            item.netValueBase,
          ),
      ),
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
          chartHeight,

        filename:
          `WEEKLY_NET_TRADES_${fromDate}_${toDate}.png`,
      });
    } catch (error) {
      console.error(
        "Weekly instrument chart export failed:",
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
          One bar per instrument.
          Buys minus sells.
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
            : "Download instrument chart"}
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
          aria-label={`Net instrument trading activity ${fromDate} to ${toDate}`}
          data-weekly-report-chart="true"
          data-chart-order="1"
          data-chart-width={
            CHART_WIDTH
          }
          data-chart-height={
            chartHeight
          }
          data-chart-filename={`WEEKLY_NET_TRADES_${fromDate}_${toDate}.png`}
          className="block min-w-[1000px] w-full"
        >
          <rect
            width={
              CHART_WIDTH
            }
            height={
              chartHeight
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
            Net instrument trades —{" "}
            {reportDateLabel(
              fromDate,
              toDate,
            )}
          </text>

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={82}
            textAnchor="middle"
            fontSize={18}
            fill="#64748b"
          >
            Purchases →
            positive · Sales →
            negative · One net
            bar per instrument
          </text>

          <line
            x1={
              CENTER_X
            }
            y1={125}
            x2={
              CENTER_X
            }
            y2={
              chartHeight -
              115
            }
            stroke="#64748b"
            strokeWidth={2}
          />

          {items.length ===
          0 ? (
            <text
              x={
                CHART_WIDTH /
                2
              }
              y={
                chartHeight /
                2
              }
              textAnchor="middle"
              fontSize={24}
              fill="#64748b"
            >
              No buy or sell
              operations
            </text>
          ) : (
            items.map(
              (
                item,
                index,
              ) => {
                const y =
                  TOP +
                  index *
                    ROW_HEIGHT;

                const width =
                  (
                    Math.abs(
                      item.netValueBase,
                    ) /
                    maxAbsoluteValue
                  ) *
                  PLOT_HALF_WIDTH;

                const isPositive =
                  item.netValueBase >=
                  0;

                const x =
                  isPositive
                    ? CENTER_X
                    : CENTER_X -
                      width;

                const labelX =
                  isPositive
                    ? CENTER_X +
                      width +
                      18
                    : CENTER_X -
                      width -
                      18;

                const labelAnchor =
                  isPositive
                    ? "start"
                    : "end";

                const displayName =
                  item.instrumentTicker ??
                  item.instrumentName;

                return (
                  <g
                    key={
                      item.instrumentId
                    }
                  >
                    <text
                      x={35}
                      y={y + 2}
                      fontSize={20}
                      fontWeight={600}
                      fill="#0f172a"
                    >
                      {displayName}
                      {" ["}
                      {formatQuantity(
                        item.netQuantity,
                      )}
                      {"]"}
                    </text>

                    <text
                      x={35}
                      y={y + 26}
                      fontSize={15}
                      fill="#64748b"
                    >
                      {
                        item.assetClassName
                      }
                    </text>

                    <line
                      x1={
                        CENTER_X -
                        PLOT_HALF_WIDTH
                      }
                      y1={
                        y + 19
                      }
                      x2={
                        CENTER_X +
                        PLOT_HALF_WIDTH
                      }
                      y2={
                        y + 19
                      }
                      stroke="#e2e8f0"
                      strokeDasharray="5 7"
                    />

                    <rect
                      x={x}
                      y={
                        y - 18
                      }
                      width={
                        Math.max(
                          width,
                          1,
                        )
                      }
                      height={42}
                      rx={5}
                      fill={
                        item.assetClassColor
                      }
                    />

                    <text
                      x={
                        labelX
                      }
                      y={
                        y + 8
                      }
                      textAnchor={
                        labelAnchor
                      }
                      fontSize={18}
                      fontWeight={600}
                      fill="#334155"
                    >
                      {isPositive
                        ? "+"
                        : "−"}
                      {formatAmount(
                        Math.abs(
                          item.netValueBase,
                        ),
                      )}{" "}
                      {
                        baseCurrency
                      }
                    </text>
                  </g>
                );
              },
            )
          )}

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={
              chartHeight -
              66
            }
            textAnchor="middle"
            fontSize={18}
            fill="#475569"
          >
            Bought:{" "}
            {formatAmount(
              boughtBase,
            )}{" "}
            {baseCurrency}
            {"   |   "}
            Sold:{" "}
            {formatAmount(
              soldBase,
            )}{" "}
            {baseCurrency}
            {"   |   "}
            Net:{" "}
            {formatAmount(
              netTradingBase,
            )}{" "}
            {baseCurrency}
          </text>

          <text
            x={
              CHART_WIDTH /
              2
            }
            y={
              chartHeight -
              34
            }
            textAnchor="middle"
            fontSize={16}
            fill="#64748b"
          >
            External
            contributions:{" "}
            {formatAmount(
              externalContributionsBase,
            )}{" "}
            {baseCurrency}
          </text>
        </svg>
      </div>
    </div>
  );
}