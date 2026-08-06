"use client";

import {
  useRef,
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

import type {
  AssetClassChartItem,
} from "@/lib/reports/monthly-chart-data";

type AssetClassStructureChartProps = {
  items: AssetClassChartItem[];
  totalValueBase: number;

  asOfDate: string;
  revision: number;
  baseCurrency: string;
};

type Point = {
  x: number;
  y: number;
};

const CHART_WIDTH = 1500;
const CHART_HEIGHT = 1000;

const CENTER_X = 470;
const CENTER_Y = 520;

const OUTER_RADIUS = 285;
const INNER_RADIUS = 165;

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

function describeDonutSegment(
  startAngle: number,
  endAngle: number,
): string {
  const safeEndAngle =
    Math.min(
      endAngle,
      startAngle + 359.999,
    );

  const outerStart =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      OUTER_RADIUS,
      startAngle,
    );

  const outerEnd =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      OUTER_RADIUS,
      safeEndAngle,
    );

  const innerEnd =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      INNER_RADIUS,
      safeEndAngle,
    );

  const innerStart =
    polarToCartesian(
      CENTER_X,
      CENTER_Y,
      INNER_RADIUS,
      startAngle,
    );

  const largeArcFlag =
    safeEndAngle -
      startAngle >
    180
      ? 1
      : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,

    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,

    `L ${innerEnd.x} ${innerEnd.y}`,

    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,

    "Z",
  ].join(" ");
}

export function AssetClassStructureChart({
  items,
  totalValueBase,
  asOfDate,
  revision,
  baseCurrency,
}: AssetClassStructureChartProps) {
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

  const positiveItems =
    items.filter(
      (item) =>
        item.marketValueBase > 0,
    );

  const segments =
  positiveItems.map(
    (item, index) => {
      const precedingValue =
        positiveItems
          .slice(0, index)
          .reduce(
            (
              sum,
              precedingItem,
            ) =>
              sum +
              precedingItem
                .marketValueBase,
            0,
          );

      const startAngle =
        totalValueBase > 0
          ? (
              precedingValue /
              totalValueBase
            ) *
            360
          : 0;

      const endAngle =
        totalValueBase > 0
          ? (
              (
                precedingValue +
                item.marketValueBase
              ) /
              totalValueBase
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
          `ASSET_CLASSES_${asOfDate}_revision-${revision}.png`,
      });
    } catch (error) {
      console.error(
        "Asset-class chart export failed:",
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
          PNG resolution: 3000 × 2000
        </p>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
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
          aria-label={`Asset-class structure as of ${asOfDate}`}
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
            y={52}
            textAnchor="middle"
            fontSize={32}
            fontWeight={600}
            fill="#0f172a"
          >
            Asset-class structure —{" "}
            {asOfDate}
          </text>

          <text
            x={CHART_WIDTH / 2}
            y={86}
            textAnchor="middle"
            fontSize={17}
            fill="#64748b"
          >
            Seven-class invested portfolio ·
            cash excluded · revision{" "}
            {revision}
          </text>

          {segments.length > 0 ? (
            <>
              {segments.map(
                ({
                  item,
                  startAngle,
                  endAngle,
                }) => (
                  <path
                    key={
                      item.assetClassCode ??
                      item.assetClassId ??
                      item.assetClassName
                    }
                    d={describeDonutSegment(
                      startAngle,
                      endAngle,
                    )}
                    fill={
                      item.assetClassColor
                    }
                    stroke="#ffffff"
                    strokeWidth={5}
                  >
                    <title>
                      {item.assetClassName}
                      {": "}
                      {formatAmount(
                        item.marketValueBase,
                      )}{" "}
                      {baseCurrency}
                      {" · "}
                      {formatPercentage(
                        item.percentage,
                      )}
                      %
                    </title>
                  </path>
                ),
              )}

              <circle
                cx={CENTER_X}
                cy={CENTER_Y}
                r={INNER_RADIUS - 2}
                fill="#ffffff"
              />

              <text
                x={CENTER_X}
                y={CENTER_Y - 32}
                textAnchor="middle"
                fontSize={19}
                fill="#64748b"
              >
                Invested assets
              </text>

              <text
                x={CENTER_X}
                y={CENTER_Y + 12}
                textAnchor="middle"
                fontSize={35}
                fontWeight={700}
                fill="#0f172a"
              >
                {formatAmount(
                  totalValueBase,
                )}
              </text>

              <text
                x={CENTER_X}
                y={CENTER_Y + 46}
                textAnchor="middle"
                fontSize={21}
                fontWeight={600}
                fill="#334155"
              >
                {baseCurrency}
              </text>

              <text
                x={CENTER_X}
                y={CENTER_Y + 80}
                textAnchor="middle"
                fontSize={16}
                fill="#64748b"
              >
                cash excluded
              </text>
            </>
          ) : (
            <text
              x={CENTER_X}
              y={CENTER_Y}
              textAnchor="middle"
              fontSize={24}
              fill="#64748b"
            >
              No invested assets
            </text>
          )}

          <text
            x={875}
            y={165}
            fontSize={20}
            fontWeight={600}
            fill="#0f172a"
          >
            Portfolio composition
          </text>

          {items.map(
            (item, index) => {
              const rowY =
                215 +
                index * 100;

              return (
                <g
                  key={
                    item.assetClassCode ??
                    item.assetClassId ??
                    item.assetClassName
                  }
                >
                  <rect
                    x={875}
                    y={rowY - 20}
                    width={22}
                    height={22}
                    rx={4}
                    fill={
                      item.assetClassColor
                    }
                  />

                  <text
                    x={915}
                    y={rowY - 3}
                    fontSize={19}
                    fontWeight={600}
                    fill="#0f172a"
                  >
                    {item.assetClassName}
                  </text>

                  <text
                    x={915}
                    y={rowY + 26}
                    fontSize={17}
                    fill="#475569"
                  >
                    {formatAmount(
                      item.marketValueBase,
                    )}{" "}
                    {baseCurrency}
                  </text>

                  <text
                    x={1380}
                    y={rowY - 3}
                    textAnchor="end"
                    fontSize={20}
                    fontWeight={700}
                    fill="#0f172a"
                  >
                    {formatPercentage(
                      item.percentage,
                    )}
                    %
                  </text>

                  <text
                    x={1380}
                    y={rowY + 26}
                    textAnchor="end"
                    fontSize={15}
                    fill="#64748b"
                  >
                    {item.itemCount}{" "}
                    {item.itemCount === 1
                      ? "position"
                      : "positions"}
                  </text>

                  <line
                    x1={875}
                    y1={rowY + 49}
                    x2={1380}
                    y2={rowY + 49}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                </g>
              );
            },
          )}

          <text
            x={CHART_WIDTH / 2}
            y={960}
            textAnchor="middle"
            fontSize={16}
            fill="#64748b"
          >
            Values based on the frozen monthly
            report snapshot
          </text>
        </svg>
      </div>
    </div>
  );
}