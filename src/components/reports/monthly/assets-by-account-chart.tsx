"use client";

import {
  useRef,
  useState,
} from "react";

import type {
  AccountChartItem,
} from "@/lib/reports/monthly-chart-data";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

type AssetsByAccountChartProps = {
  items: AccountChartItem[];
  totalValueBase: number;

  asOfDate: string;
  revision: number;
  baseCurrency: string;
};

const CHART_WIDTH = 1500;
const CHART_HEIGHT = 900;

function formatAmount(
  value: number,
): string {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

function getAccountColor(
  item: AccountChartItem,
): string {
  const ownerName =
    item.ownerName.toLowerCase();

  const accountType =
    item.accountType.toLowerCase();

  const accountName =
    item.accountName.toLowerCase();

  if (
    accountType.includes(
      "government",
    ) ||
    accountName.includes("bond")
  ) {
    return "#8D99AE";
  }

  if (
    accountType.includes("crypto") ||
    accountName.includes("crypto")
  ) {
    return "#F2A900";
  }

  if (
    accountType.includes("ppk")
  ) {
    return ownerName.includes(
      "natalia",
    )
      ? "#71C39A"
      : "#7C72E6";
  }

  if (
    ownerName.includes("natalia")
  ) {
    if (
      accountType.includes("ike")
    ) {
      return "#168A65";
    }

    if (
      accountType.includes("ikze")
    ) {
      return "#28B889";
    }

    return "#4EBE9F";
  }

  if (
    accountType.includes("ike")
  ) {
    return "#3157C8";
  }

  if (
    accountType.includes("ikze")
  ) {
    return "#4B7ED8";
  }

  if (
    accountType.includes(
      "broker",
    )
  ) {
    return "#5E93DA";
  }

  return "#64748B";
}

function getAccountSortOrder(
  item: AccountChartItem,
): number {
  const ownerName =
    item.ownerName.toLowerCase();

  const accountType =
    item.accountType.toLowerCase();

  const accountName =
    item.accountName.toLowerCase();

  if (
    accountName.includes("government") ||
    accountName.includes("bond")
  ) {
    return 0;
  }

  if (
    ownerName.includes("jakub") &&
    accountType === "ike"
  ) {
    return 1;
  }

  if (
    ownerName.includes("jakub") &&
    accountType === "ikze"
  ) {
    return 2;
  }

  if (
    ownerName.includes("jakub") &&
    accountName.includes("usd")
  ) {
    return 3;
  }

  if (
    ownerName.includes("jakub") &&
    accountType === "ppk"
  ) {
    return 4;
  }

  if (
    ownerName.includes("natalia") &&
    accountType === "ike"
  ) {
    return 5;
  }

  if (
    ownerName.includes("natalia") &&
    accountType === "ikze"
  ) {
    return 6;
  }

  if (
    ownerName.includes("natalia") &&
    accountType === "ppk"
  ) {
    return 7;
  }

  if (
    accountType.includes("crypto") ||
    accountName.includes("crypto")
  ) {
    return 8;
  }

  return 99;
}

export function AssetsByAccountChart({
  items,
  totalValueBase,
  asOfDate,
  revision,
  baseCurrency,
}: AssetsByAccountChartProps) {
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

  const orderedItems =
    [...items].sort(
      (first, second) =>
        getAccountSortOrder(first) -
          getAccountSortOrder(second) ||
        first.ownerName.localeCompare(
          second.ownerName,
        ) ||
        first.accountName.localeCompare(
          second.accountName,
        ),
    );

  const topMargin = 145;
  const bottomMargin = 220;
  const leftMargin = 150;
  const rightMargin = 70;

  const plotWidth =
    CHART_WIDTH -
    leftMargin -
    rightMargin;

  const plotHeight =
    CHART_HEIGHT -
    topMargin -
    bottomMargin;

  const maximumValue =
    Math.max(
      ...orderedItems.map(
        (item) =>
          item.marketValueBase,
      ),
      1,
    );

  const axisMaximum =
    calculateAxisMaximum(
      maximumValue,
    );

  const tickCount = 7;

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

  const slotWidth =
    orderedItems.length > 0
      ? plotWidth /
        orderedItems.length
      : plotWidth;

  const barWidth =
    Math.min(
      105,
      slotWidth * 0.62,
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
        height: CHART_HEIGHT,

        filename:
          `ACCOUNTS_${asOfDate}.png`,
      });
    } catch (error) {
      console.error(
        "Assets-by-account chart export failed:",
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
          PNG resolution: 3000 × 1800
        </p>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
        >
          {isDownloading
            ? "Generating PNG…"
            : "Download account chart"}
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
          aria-label={`Invested assets by account as of ${asOfDate}`}
          data-monthly-report-chart="true"
          data-chart-order="2"
          data-chart-width={CHART_WIDTH}
          data-chart-height={CHART_HEIGHT}
          data-chart-filename={`ACCOUNTS_${asOfDate}.png`}
          data-report-revision={revision}
          className="block min-w-[900px] w-full"
        >
          <rect
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
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
            Assets by account:{" "}
            {formatAmount(
              totalValueBase,
            )}{" "}
            {baseCurrency} —{" "}
            {asOfDate}
          </text>

          {ticks.map((tick) => {
            const y =
              topMargin +
              plotHeight -
              (
                tick /
                axisMaximum
              ) *
                plotHeight;

            return (
              <g key={tick}>
                <line
                  x1={leftMargin}
                  y1={y}
                  x2={
                    CHART_WIDTH -
                    rightMargin
                  }
                  y2={y}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  strokeDasharray="6 5"
                />

                <text
                  x={leftMargin - 16}
                  y={y + 6}
                  textAnchor="end"
                  fontSize={17}
                  fill="#475569"
                >
                  {formatAmount(tick)}{" "}
                  {baseCurrency}
                </text>
              </g>
            );
          })}

          {orderedItems.map(
            (item, index) => {
              const centerX =
                leftMargin +
                index *
                  slotWidth +
                slotWidth / 2;

              const height =
                (
                  item.marketValueBase /
                  axisMaximum
                ) *
                plotHeight;

              const x =
                centerX -
                barWidth / 2;

              const y =
                topMargin +
                plotHeight -
                height;

              const accountLabel =
                `${item.ownerName} · ${item.accountName}`;

              return (
                <g key={item.accountId}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, height)}
                    rx={3}
                    fill={
                      getAccountColor(item)
                    }
                  />

                  <text
                    x={centerX}
                    y={y - 34}
                    textAnchor="middle"
                    fontSize={17}
                    fontWeight={600}
                    fill="#0f172a"
                  >
                    {formatPercentage(
                      item.percentage,
                    )}
                    %
                  </text>

                  <text
                    x={centerX}
                    y={y - 12}
                    textAnchor="middle"
                    fontSize={16}
                    fill="#334155"
                  >
                    {formatAmount(
                      item.marketValueBase,
                    )}{" "}
                    {baseCurrency}
                  </text>

                  <text
                    x={centerX}
                    y={
                      topMargin +
                      plotHeight +
                      38
                    }
                    textAnchor="end"
                    fontSize={17}
                    fill="#0f172a"
                    transform={`rotate(-28 ${centerX} ${
                      topMargin +
                      plotHeight +
                      38
                    })`}
                  >
                    {accountLabel}
                  </text>
                </g>
              );
            },
          )}

          <line
            x1={leftMargin}
            y1={
              topMargin +
              plotHeight
            }
            x2={
              CHART_WIDTH -
              rightMargin
            }
            y2={
              topMargin +
              plotHeight
            }
            stroke="#334155"
            strokeWidth={2}
          />

          <text
            x={34}
            y={
              topMargin +
              plotHeight / 2
            }
            textAnchor="middle"
            fontSize={20}
            fill="#0f172a"
            transform={`rotate(-90 34 ${
              topMargin +
              plotHeight / 2
            })`}
          >
            Value in {baseCurrency}
          </text>
        </svg>
      </div>
    </div>
  );
}