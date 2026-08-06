"use client";

import {
  useRef,
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

import type {
  PortfolioHistoryPoint,
} from "@/lib/reports/monthly-chart-data";

type PortfolioHistoryChartProps = {
  points: PortfolioHistoryPoint[];

  asOfDate: string;
  revision: number;
  baseCurrency: string;
};

type PositionedHistoryPoint = {
  point: PortfolioHistoryPoint;
  index: number;

  x: number;
  portfolioY: number;
  contributionY: number | null;
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

function formatSignedAmount(
  value: number,
): string {
  const prefix =
    value > 0 ? "+" : "";

  return `${prefix}${formatAmount(value)}`;
}

function formatReportDate(
  value: string,
): string {
  const [
    year,
    month,
    day,
  ] = value.split("-");

  return `${day}.${month}.${year}`;
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

function buildPolylinePoints(
  points: Array<{
    x: number;
    y: number;
  }>,
): string {
  return points
    .map(
      (point) =>
        `${point.x},${point.y}`,
    )
    .join(" ");
}

export function PortfolioHistoryChart({
  points,
  asOfDate,
  revision,
  baseCurrency,
}: PortfolioHistoryChartProps) {
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

  const sortedPoints =
    [...points].sort(
      (first, second) =>
        first.asOfDate.localeCompare(
          second.asOfDate,
        ),
    );

  const topMargin = 155;
  const bottomMargin = 150;
  const leftMargin = 145;
  const rightMargin = 85;

  const plotWidth =
    CHART_WIDTH -
    leftMargin -
    rightMargin;

  const plotHeight =
    CHART_HEIGHT -
    topMargin -
    bottomMargin;

  const allValues =
    sortedPoints.flatMap(
      (point) => {
        const values = [
          point.totalValueBase,
        ];

        if (
          point
            .cumulativeContributionsBase !==
          null
        ) {
          values.push(
            point
              .cumulativeContributionsBase,
          );
        }

        return values;
      },
    );

  const maximumValue =
    Math.max(
      ...allValues,
      1,
    );

  const axisMaximum =
    calculateAxisMaximum(
      maximumValue * 1.08,
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

  const positionedPoints:
    PositionedHistoryPoint[] =
      sortedPoints.map(
        (point, index) => {
          const x =
            sortedPoints.length === 1
              ? leftMargin +
                plotWidth / 2
              : leftMargin +
                (
                  index /
                  (
                    sortedPoints.length -
                    1
                  )
                ) *
                  plotWidth;

          const portfolioY =
            topMargin +
            plotHeight -
            (
              point.totalValueBase /
              axisMaximum
            ) *
              plotHeight;

          const contributionY =
            point
              .cumulativeContributionsBase ===
            null
              ? null
              : topMargin +
                plotHeight -
                (
                  point
                    .cumulativeContributionsBase /
                  axisMaximum
                ) *
                  plotHeight;

          return {
            point,
            index,
            x,
            portfolioY,
            contributionY,
          };
        },
      );

  const portfolioLinePoints =
    positionedPoints.map(
      (positionedPoint) => ({
        x: positionedPoint.x,
        y:
          positionedPoint
            .portfolioY,
      }),
    );

  const contributionLinePoints =
    positionedPoints
      .filter(
        (
          positionedPoint,
        ): positionedPoint is
          PositionedHistoryPoint & {
            contributionY: number;
          } =>
          positionedPoint
            .contributionY !== null,
      )
      .map(
        (positionedPoint) => ({
          x: positionedPoint.x,
          y:
            positionedPoint
              .contributionY,
        }),
      );

  const latestPoint =
    sortedPoints.at(-1) ?? null;

  const latestGain =
    latestPoint
      ?.portfolioGainBase ?? null;

  const labelEvery =
    Math.max(
      1,
      Math.ceil(
        sortedPoints.length / 10,
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

        width: CHART_WIDTH,
        height: CHART_HEIGHT,

        filename:
          `PORTFOLIO_HISTORY_${asOfDate}_revision-${revision}.png`,
      });
    } catch (error) {
      console.error(
        "Portfolio history chart export failed:",
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
            : "Download history chart"}
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
          aria-label={`Portfolio value and cumulative contributions through ${asOfDate}`}
          data-monthly-report-chart="true"
          data-chart-order="4"
          data-chart-width={CHART_WIDTH}
          data-chart-height={CHART_HEIGHT}
          data-chart-filename={`PORTFOLIO_HISTORY_${asOfDate}_revision-${revision}.png`}
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
            Portfolio value and cumulative
            contributions
          </text>

          <text
            x={CHART_WIDTH / 2}
            y={84}
            textAnchor="middle"
            fontSize={17}
            fill="#64748b"
          >
            Through {asOfDate} · cash excluded ·
            revision {revision}
          </text>

          <g>
            <line
              x1={500}
              y1={116}
              x2={560}
              y2={116}
              stroke="#2563eb"
              strokeWidth={5}
              strokeLinecap="round"
            />

            <circle
              cx={530}
              cy={116}
              r={7}
              fill="#2563eb"
            />

            <text
              x={574}
              y={122}
              fontSize={17}
              fill="#334155"
            >
              Portfolio value
            </text>

            <line
              x1={790}
              y1={116}
              x2={850}
              y2={116}
              stroke="#e11d48"
              strokeWidth={4}
              strokeDasharray="12 8"
              strokeLinecap="round"
            />

            <circle
              cx={820}
              cy={116}
              r={7}
              fill="#e11d48"
            />

            <text
              x={864}
              y={122}
              fontSize={17}
              fill="#334155"
            >
              Cumulative contributions
            </text>
          </g>

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
                  x={leftMargin - 17}
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

          {portfolioLinePoints.length >
            1 && (
            <polyline
              points={buildPolylinePoints(
                portfolioLinePoints,
              )}
              fill="none"
              stroke="#2563eb"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {contributionLinePoints.length >
            1 && (
            <polyline
              points={buildPolylinePoints(
                contributionLinePoints,
              )}
              fill="none"
              stroke="#e11d48"
              strokeWidth={5}
              strokeDasharray="14 10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {positionedPoints.map(
            (positionedPoint) => {
              const {
                point,
                index,
                x,
                portfolioY,
                contributionY,
              } = positionedPoint;

              const showDateLabel =
                index %
                  labelEvery ===
                  0 ||
                index ===
                  positionedPoints.length -
                    1;

              return (
                <g
                  key={
                    point.reportRunId
                  }
                >
                  <circle
                    cx={x}
                    cy={portfolioY}
                    r={9}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={5}
                  />

                  <text
                    x={x}
                    y={portfolioY - 18}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    fill="#1d4ed8"
                  >
                    {formatAmount(
                      point.totalValueBase,
                    )}
                  </text>

                  {contributionY !==
                    null && (
                    <>
                      <circle
                        cx={x}
                        cy={contributionY}
                        r={8}
                        fill="#ffffff"
                        stroke="#e11d48"
                        strokeWidth={4}
                      />

                      <text
                        x={x}
                        y={
                          contributionY +
                          27
                        }
                        textAnchor="middle"
                        fontSize={14}
                        fontWeight={600}
                        fill="#be123c"
                      >
                        {formatAmount(
                          point
                            .cumulativeContributionsBase ??
                            0,
                        )}
                      </text>
                    </>
                  )}

                  {showDateLabel && (
                    <text
                      x={x}
                      y={
                        topMargin +
                        plotHeight +
                        40
                      }
                      textAnchor="middle"
                      fontSize={16}
                      fill="#475569"
                    >
                      {formatReportDate(
                        point.asOfDate,
                      )}
                    </text>
                  )}
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

          {latestPoint &&
            latestGain !== null && (
            <g>
              <rect
                x={CHART_WIDTH - 430}
                y={CHART_HEIGHT - 92}
                width={345}
                height={58}
                rx={12}
                fill={
                  latestGain >= 0
                    ? "#ecfdf5"
                    : "#fff1f2"
                }
                stroke={
                  latestGain >= 0
                    ? "#a7f3d0"
                    : "#fecdd3"
                }
              />

              <text
                x={CHART_WIDTH - 405}
                y={CHART_HEIGHT - 68}
                fontSize={15}
                fill="#64748b"
              >
                Gain above contributions
              </text>

              <text
                x={CHART_WIDTH - 405}
                y={CHART_HEIGHT - 44}
                fontSize={20}
                fontWeight={700}
                fill={
                  latestGain >= 0
                    ? "#047857"
                    : "#be123c"
                }
              >
                {formatSignedAmount(
                  latestGain,
                )}{" "}
                {baseCurrency}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}