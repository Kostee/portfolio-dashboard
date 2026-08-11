"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  generateWeeklyOperationReport,
} from "@/app/portfolio/reports/weekly/actions";

type ExistingRange = {
  id: string;
  fromDate: string;
  toDate: string;
};

type WeeklyReportGeneratorProps = {
  defaultFromDate: string;
  defaultToDate: string;

  existingRanges:
    ExistingRange[];
};

export function WeeklyReportGenerator({
  defaultFromDate,
  defaultToDate,
  existingRanges,
}: WeeklyReportGeneratorProps) {
  const [
    fromDate,
    setFromDate,
  ] = useState(
    defaultFromDate,
  );

  const [
    toDate,
    setToDate,
  ] = useState(
    defaultToDate,
  );

  const existingReport =
    useMemo(
      () =>
        existingRanges.find(
          (range) =>
            range.fromDate ===
              fromDate &&
            range.toDate ===
              toDate,
        ) ?? null,
      [
        existingRanges,
        fromDate,
        toDate,
      ],
    );

  function setToday() {
    setFromDate(
      defaultToDate,
    );

    setToDate(
      defaultToDate,
    );
  }

  function setLastThreeDays() {
    setFromDate(
      defaultFromDate,
    );

    setToDate(
      defaultToDate,
    );
  }

  return (
    <form
      action={
        generateWeeklyOperationReport
      }
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="fromDate"
            className="block text-sm font-medium text-slate-700"
          >
            From
          </label>

          <input
            id="fromDate"
            name="fromDate"
            type="date"
            required
            value={fromDate}
            onChange={(
              event,
            ) =>
              setFromDate(
                event.target.value,
              )
            }
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="toDate"
            className="block text-sm font-medium text-slate-700"
          >
            To
          </label>

          <input
            id="toDate"
            name="toDate"
            type="date"
            required
            value={toDate}
            onChange={(
              event,
            ) =>
              setToDate(
                event.target.value,
              )
            }
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Both boundary dates are included.
        The default range covers today and
        the previous two calendar days.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setToday}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Today
        </button>

        <button
          type="button"
          onClick={
            setLastThreeDays
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Last 3 days
        </button>
      </div>

      {existingReport && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            A report for this exact date
            range already exists.
          </p>

          <p className="mt-1 text-xs leading-5 text-amber-800">
            Generating it again will replace
            the existing frozen report data.
          </p>
        </div>
      )}

      <button
        type="submit"
        className="mt-5 w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {existingReport
          ? "Replace report"
          : "Generate report"}
      </button>
    </form>
  );
}