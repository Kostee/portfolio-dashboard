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

type IntervalGainLabel = {
  key: string;
  x: number;
  y: number;
  value: number;
};

const CHART_WIDTH = 1500;
const CHART_HEIGHT = 960;

const PORTFOLIO_COLOR = "#111827";
const CONTRIBUTION_COLOR = "#F59E0B";
const SPECIAL_DATE = "2025-12-29";

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
  return value;
}

function isoDateToDayNumber(
  value: string,
): number {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  return Math.floor(
    Date.UTC(
      year,
      month - 1,
      day,
    ) /
      86_400_000,
  );
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

function buildDiamondPoints(
  x: number,
  y: number,
  radius: number,
): string {
  return [
    `${x},${y - radius}`,
    `${x + radius},${y}`,
    `${x},${y + radius}`,
    `${x - radius},${y}`,
  ].join(" ");
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

  const topMargin = 165;
  const bottomMargin = 175;
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

  const firstDay =
    sortedPoints.length > 0
      ? isoDateToDayNumber(
          sortedPoints[0].asOfDate,
        )
      : 0;

  const lastDay =
    sortedPoints.length > 0
      ? isoDateToDayNumber(
          sortedPoints[
            sortedPoints.length - 1
          ].asOfDate,
        )
      : firstDay;

  const dateRange =
    Math.max(
      1,
      lastDay - firstDay,
    );

  const positionedPoints:
    PositionedHistoryPoint[] =
      sortedPoints.map(
        (point, index) => {
          const dayNumber =
            isoDateToDayNumber(
              point.asOfDate,
            );

          const x =
            sortedPoints.length === 1
              ? leftMargin +
                plotWidth / 2
              : leftMargin +
                (
                  (
                    dayNumber -
                    firstDay
                  ) /
                  dateRange
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

  const intervalGainLabels:
    IntervalGainLabel[] = [];

  for (
    let index = 1;
    index < positionedPoints.length;
    index += 1
  ) {
    const previous =
      positionedPoints[index - 1];

    const current =
      positionedPoints[index];

    const previousContributions =
      previous.point
        .cumulativeContributionsBase;

    const currentContributions =
      current.point
        .cumulativeContributionsBase;

    if (
      previousContributions === null ||
      currentContributions === null
    ) {
      continue;
    }

    const portfolioChange =
      current.point.totalValueBase -
      previous.point.totalValueBase;

    const contributionChange =
      currentContributions -
      previousContributions;

    const intervalGain =
      portfolioChange -
      contributionChange;

    const x =
      (previous.x + current.x) /
      2;

    const portfolioMidY =
      (
        previous.portfolioY +
        current.portfolioY
      ) /
      2;

    const contributionMidY =
      previous.contributionY !== null &&
      current.contributionY !== null
        ? (
            previous.contributionY +
            current.contributionY
          ) /
          2
        : portfolioMidY + 70;

    const y =
      Math.min(
        portfolioMidY + 36,
        contributionMidY - 28,
      );

    intervalGainLabels.push({
      key:
        `${previous.point.asOfDate}:${current.point.asOfDate}`,
      x,
      y,
      value: intervalGain,
    });
  }

  const latestPoint =
    sortedPoints.at(-1) ?? null;

  const latestGain =
    latestPoint
      ?.portfolioGainBase ?? null;

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
          `PORTFOLIO_HISTORY_${asOfDate}.png`,
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
          PNG resolution: 3000 × 1920
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
          data-chart-filename={`PORTFOLIO_HISTORY_${asOfDate}.png`}
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
            y={58}
            textAnchor="middle"
            fontSize={32}
            fontWeight={600}
            fill="#0f172a"
          >
            Portfolio value and cumulative contributions —{" "}
            {asOfDate}
          </text>

          <g>
            <line
              x1={500}
              y1={116}
              x2={560}
              y2={116}
              stroke={PORTFOLIO_COLOR}
              strokeWidth={5}
              strokeLinecap="round"
            />

            <circle
              cx={530}
              cy={116}
              r={7}
              fill={PORTFOLIO_COLOR}
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
              stroke={CONTRIBUTION_COLOR}
              strokeWidth={5}
              strokeLinecap="round"
            />

            <circle
              cx={820}
              cy={116}
              r={7}
              fill={CONTRIBUTION_COLOR}
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

          {positionedPoints
            .filter(
              ({ point }) =>
                point.asOfDate ===
                SPECIAL_DATE,
            )
            .map((specialPoint) => (
              <g key="year-end-guide">
                <line
                  x1={specialPoint.x}
                  y1={topMargin - 18}
                  x2={specialPoint.x}
                  y2={
                    topMargin +
                    plotHeight +
                    12
                  }
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="5 7"
                />

                <text
                  x={specialPoint.x}
                  y={topMargin - 28}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={600}
                  fill="#64748b"
                >
                  Year-end checkpoint
                </text>
              </g>
            ))}

          {portfolioLinePoints.length >
            1 && (
            <polyline
              points={buildPolylinePoints(
                portfolioLinePoints,
              )}
              fill="none"
              stroke={PORTFOLIO_COLOR}
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
              stroke={CONTRIBUTION_COLOR}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {intervalGainLabels.map(
            (label) => (
              <text
                key={label.key}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fill={
                  label.value >= 0
                    ? "#047857"
                    : "#be123c"
                }
              >
                {formatSignedAmount(
                  label.value,
                )}{" "}
                {baseCurrency}
              </text>
            ),
          )}

          {positionedPoints.map(
            (positionedPoint) => {
              const {
                point,
                x,
                portfolioY,
                contributionY,
              } = positionedPoint;

              const isSpecial =
                point.asOfDate ===
                SPECIAL_DATE;

              return (
                <g
                  key={
                    point.historyPointId
                  }
                >
                  {isSpecial ? (
                    <polygon
                      points={buildDiamondPoints(
                        x,
                        portfolioY,
                        11,
                      )}
                      fill="#ffffff"
                      stroke={PORTFOLIO_COLOR}
                      strokeWidth={5}
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={portfolioY}
                      r={9}
                      fill="#ffffff"
                      stroke={PORTFOLIO_COLOR}
                      strokeWidth={5}
                    />
                  )}

                  <text
                    x={x}
                    y={portfolioY - 18}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    fill={PORTFOLIO_COLOR}
                  >
                    {formatAmount(
                      point.totalValueBase,
                    )}
                  </text>

                  {contributionY !==
                    null && (
                    <>
                      {isSpecial ? (
                        <polygon
                          points={buildDiamondPoints(
                            x,
                            contributionY,
                            10,
                          )}
                          fill="#ffffff"
                          stroke={CONTRIBUTION_COLOR}
                          strokeWidth={4}
                        />
                      ) : (
                        <circle
                          cx={x}
                          cy={contributionY}
                          r={8}
                          fill="#ffffff"
                          stroke={CONTRIBUTION_COLOR}
                          strokeWidth={4}
                        />
                      )}

                      <text
                        x={x}
                        y={
                          contributionY +
                          27
                        }
                        textAnchor="middle"
                        fontSize={14}
                        fontWeight={600}
                        fill={PORTFOLIO_COLOR}
                      >
                        {formatAmount(
                          point
                            .cumulativeContributionsBase ??
                            0,
                        )}
                      </text>
                    </>
                  )}

                  <text
                    x={x}
                    y={
                      topMargin +
                      plotHeight +
                      42
                    }
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={
                      isSpecial
                        ? 700
                        : 400
                    }
                    fill={
                      isSpecial
                        ? "#334155"
                        : "#475569"
                    }
                  >
                    {formatReportDate(
                      point.asOfDate,
                    )}
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