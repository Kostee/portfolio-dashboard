"use client";

import {
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

type ChartDefinition = {
  svg: SVGSVGElement;
  order: number;
  width: number;
  height: number;
  filename: string;
};

function readChart(
  svg: SVGSVGElement,
): ChartDefinition {
  const order =
    Number(
      svg.dataset.chartOrder,
    );

  const width =
    Number(
      svg.dataset.chartWidth,
    );

  const height =
    Number(
      svg.dataset.chartHeight,
    );

  const filename =
    svg.dataset.chartFilename;

  if (
    !Number.isFinite(order) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !filename
  ) {
    throw new Error(
      "Invalid weekly chart export metadata.",
    );
  }

  return {
    svg,
    order,
    width,
    height,
    filename,
  };
}

function pause(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) =>
      window.setTimeout(
        resolve,
        milliseconds,
      ),
  );
}

export function DownloadAllWeeklyChartsButton() {
  const [
    isDownloading,
    setIsDownloading,
  ] =
    useState(false);

  const [
    completed,
    setCompleted,
  ] =
    useState(0);

  async function handleDownload() {
    setIsDownloading(true);
    setCompleted(0);

    try {
      const charts =
        Array.from(
          document.querySelectorAll<SVGSVGElement>(
            'svg[data-weekly-report-chart="true"]',
          ),
        )
          .map(
            readChart,
          )
          .sort(
            (
              first,
              second,
            ) =>
              first.order -
              second.order,
          );

      for (
        let index = 0;
        index <
        charts.length;
        index += 1
      ) {
        const chart =
          charts[index];

        await exportSvgAsPng({
          svg:
            chart.svg,

          width:
            chart.width,

          height:
            chart.height,

          filename:
            chart.filename,
        });

        setCompleted(
          index + 1,
        );

        await pause(
          200,
        );
      }
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={
        handleDownload
      }
      disabled={
        isDownloading
      }
      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
    >
      {isDownloading
        ? `Downloading ${completed}/2…`
        : "Download both charts"}
    </button>
  );
}