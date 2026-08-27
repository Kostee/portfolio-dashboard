"use client";

import {
  useMemo,
  useState,
} from "react";

type DailyOpenHistoryPoint = {
  tradingDate: string;
  openPrice: number;
};

type DailyOpenHistoryChartProps = {
  ticker: string;
  name: string;
  currency: string;
  points: DailyOpenHistoryPoint[];
};

type HistoryRange =
  | "ytd"
  | "6m"
  | "1m";

const RANGE_OPTIONS: Array<{
  value: HistoryRange;
  label: string;
}> = [
  {
    value: "ytd",
    label: "YTD",
  },
  {
    value: "6m",
    label: "6 MONTHS",
  },
  {
    value: "1m",
    label: "1 MONTH",
  },
];

function formatPrice(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    },
  ).format(value);
}

function getTickIndexes(
  length: number,
  count: number,
): number[] {
  if (length <= count) {
    return Array.from(
      {
        length,
      },
      (
        _,
        index,
      ) => index,
    );
  }

  return Array.from(
    {
      length: count,
    },
    (
      _,
      index,
    ) =>
      Math.round(
        (
          index *
          (
            length -
            1
          )
        ) /
          (
            count -
            1
          ),
      ),
  );
}

function shiftIsoMonths(
  value: string,
  months: number,
): string {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const targetMonthIndex =
    month -
    1 +
    months;

  const targetYear =
    year +
    Math.floor(
      targetMonthIndex /
        12,
    );

  const normalizedMonthIndex =
    (
      (
        targetMonthIndex %
        12
      ) +
      12
    ) %
    12;

  const lastDay =
    new Date(
      Date.UTC(
        targetYear,
        normalizedMonthIndex +
          1,
        0,
      ),
    ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonthIndex,
      Math.min(
        day,
        lastDay,
      ),
    ),
  )
    .toISOString()
    .slice(
      0,
      10,
    );
}

function getRangeStartDate(
  latestDate: string,
  range: HistoryRange,
): string {
  if (
    range ===
    "ytd"
  ) {
    return `${latestDate.slice(0, 4)}-01-01`;
  }

  return shiftIsoMonths(
    latestDate,
    range === "6m"
      ? -6
      : -1,
  );
}

export function DailyOpenHistoryChart({
  ticker,
  name,
  currency,
  points,
}: DailyOpenHistoryChartProps) {
  const [
    range,
    setRange,
  ] =
    useState<HistoryRange>(
      "6m",
    );

  const chartPoints =
    useMemo(
      () => {
        if (
          points.length ===
          0
        ) {
          return [];
        }

        const latestDate =
          points[
            points.length -
              1
          ].tradingDate;

        const startDate =
          getRangeStartDate(
            latestDate,
            range,
          );

        const filtered =
          points.filter(
            (point) =>
              point.tradingDate >=
              startDate,
          );

        return filtered.length >
          0
          ? filtered
          : points.slice(-1);
      },
      [
        points,
        range,
      ],
    );

  if (
    points.length ===
    0
  ) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <p className="font-medium text-slate-800">
          No opening-price history yet
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          The chart will grow automatically as daily market-open records are
          collected.
        </p>
      </div>
    );
  }

  const width =
    960;

  const height =
    360;

  const left =
    76;

  const right =
    24;

  const top =
    26;

  const bottom =
    58;

  const chartWidth =
    width -
    left -
    right;

  const chartHeight =
    height -
    top -
    bottom;

  const values =
    chartPoints.map(
      (point) =>
        point.openPrice,
    );

  const rawMin =
    Math.min(
      ...values,
    );

  const rawMax =
    Math.max(
      ...values,
    );

  const rawRange =
    rawMax -
    rawMin;

  const padding =
    rawRange > 0
      ? rawRange *
        0.08
      : Math.max(
          Math.abs(
            rawMax,
          ) *
            0.02,
          0.01,
        );

  const minValue =
    rawMin -
    padding;

  const maxValue =
    rawMax +
    padding;

  const valueRange =
    Math.max(
      maxValue -
        minValue,
      Number.EPSILON,
    );

  const parsedTimes =
    chartPoints.map(
      (point) =>
        new Date(
          `${point.tradingDate}T00:00:00Z`,
        ).getTime(),
    );

  const firstTime =
    parsedTimes[0];

  const lastTime =
    parsedTimes[
      parsedTimes.length -
        1
    ];

  const timeRange =
    Math.max(
      lastTime -
        firstTime,
      1,
    );

  const getX =
    (
      index: number,
    ): number => {
      if (
        chartPoints.length ===
        1
      ) {
        return (
          left +
          chartWidth /
            2
        );
      }

      return (
        left +
        (
          (
            parsedTimes[
              index
            ] -
            firstTime
          ) /
          timeRange
        ) *
          chartWidth
      );
    };

  const getY =
    (
      value: number,
    ): number =>
      top +
      (
        (
          maxValue -
          value
        ) /
        valueRange
      ) *
        chartHeight;

  const path =
    chartPoints
      .map(
        (
          point,
          index,
        ) =>
          `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getY(
            point.openPrice,
          ).toFixed(2)}`,
      )
      .join(
        " ",
      );

  const yTicks =
    Array.from(
      {
        length: 5,
      },
      (
        _,
        index,
      ) => {
        const ratio =
          index /
          4;

        return (
          maxValue -
          ratio *
            valueRange
        );
      },
    );

  const xTickIndexes =
    getTickIndexes(
      chartPoints.length,
      6,
    );

  const latestPoint =
    chartPoints[
      chartPoints.length -
        1
    ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {ticker} ·{" "}
            {name}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Daily session opening prices ·{" "}
            {
              chartPoints[0]
                .tradingDate
            }{" "}
            →{" "}
            {
              latestPoint.tradingDate
            }
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div
            className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1"
            aria-label="Opening-price chart range"
          >
            {RANGE_OPTIONS.map(
              (
                option,
              ) => {
                const active =
                  range ===
                  option.value;

                return (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    aria-pressed={
                      active
                    }
                    onClick={() =>
                      setRange(
                        option.value,
                      )
                    }
                    className={
                      active
                        ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                        : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                    }
                  >
                    {
                      option.label
                    }
                  </button>
                );
              },
            )}
          </div>

          <p className="text-sm text-slate-600">
            {
              chartPoints.length
            }{" "}
            {chartPoints.length ===
            1
              ? "observation"
              : "observations"}
            {" · "}
            {formatPrice(
              latestPoint.openPrice,
            )}{" "}
            {currency}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <svg
          role="img"
          aria-label={`Daily opening-price history for ${ticker}`}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[720px]"
        >
          <title>
            {`Daily opening-price history for ${ticker}`}
          </title>

          {yTicks.map(
            (
              tick,
              index,
            ) => {
              const y =
                getY(
                  tick,
                );

              return (
                <g
                  key={`y-${index}`}
                >
                  <line
                    x1={
                      left
                    }
                    x2={
                      width -
                      right
                    }
                    y1={
                      y
                    }
                    y2={
                      y
                    }
                    className="stroke-slate-200"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      left -
                      12
                    }
                    y={
                      y +
                      4
                    }
                    textAnchor="end"
                    className="fill-slate-500 text-[11px]"
                  >
                    {formatPrice(
                      tick,
                    )}
                  </text>
                </g>
              );
            },
          )}

          <line
            x1={
              left
            }
            x2={
              left
            }
            y1={
              top
            }
            y2={
              top +
              chartHeight
            }
            className="stroke-slate-300"
            strokeWidth="1"
          />

          <line
            x1={
              left
            }
            x2={
              width -
              right
            }
            y1={
              top +
              chartHeight
            }
            y2={
              top +
              chartHeight
            }
            className="stroke-slate-300"
            strokeWidth="1"
          />

          {xTickIndexes.map(
            (
              pointIndex,
            ) => {
              const point =
                chartPoints[
                  pointIndex
                ];

              const x =
                getX(
                  pointIndex,
                );

              return (
                <g
                  key={`x-${point.tradingDate}`}
                >
                  <line
                    x1={
                      x
                    }
                    x2={
                      x
                    }
                    y1={
                      top +
                      chartHeight
                    }
                    y2={
                      top +
                      chartHeight +
                      6
                    }
                    className="stroke-slate-300"
                    strokeWidth="1"
                  />

                  <text
                    x={
                      x
                    }
                    y={
                      height -
                      24
                    }
                    textAnchor="middle"
                    className="fill-slate-500 text-[11px]"
                  >
                    {
                      point.tradingDate
                    }
                  </text>
                </g>
              );
            },
          )}

          {chartPoints.length >
            1 && (
            <path
              d={
                path
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-800"
            />
          )}

          {chartPoints.map(
            (
              point,
              index,
            ) => (
              <circle
                key={
                  point.tradingDate
                }
                cx={
                  getX(
                    index,
                  )
                }
                cy={
                  getY(
                    point.openPrice,
                  )
                }
                r={
                  chartPoints.length <=
                  80
                    ? 4
                    : 2.5
                }
                fill="currentColor"
                className="text-slate-800"
              >
                <title>
                  {`${point.tradingDate}: ${formatPrice(point.openPrice)} ${currency}`}
                </title>
              </circle>
            ),
          )}
        </svg>
      </div>
    </div>
  );
}