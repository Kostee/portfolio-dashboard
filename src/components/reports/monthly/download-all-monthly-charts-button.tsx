"use client";

import {
  useState,
} from "react";

import {
  exportSvgAsPng,
} from "@/lib/charts/export-svg-as-png";

type DownloadAllMonthlyChartsButtonProps = {
  availableChartCount: number;
};

type ChartExportDefinition = {
  svg: SVGSVGElement;

  order: number;
  width: number;
  height: number;

  filename: string;
};

function readChartDefinition(
  svg: SVGSVGElement,
): ChartExportDefinition {
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
    width <= 0 ||
    height <= 0 ||
    !filename
  ) {
    throw new Error(
      "A chart contains invalid export metadata.",
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
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

export function DownloadAllMonthlyChartsButton({
  availableChartCount,
}: DownloadAllMonthlyChartsButtonProps) {
  const [
    isDownloading,
    setIsDownloading,
  ] = useState(false);

  const [
    completedCount,
    setCompletedCount,
  ] = useState(0);

  const [
    resultMessage,
    setResultMessage,
  ] = useState<
    string | null
  >(null);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(null);

  async function handleDownloadAll() {
    setIsDownloading(true);
    setCompletedCount(0);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const chartDefinitions =
        Array.from(
          document.querySelectorAll<SVGSVGElement>(
            'svg[data-monthly-report-chart="true"]',
          ),
        )
          .map(
            readChartDefinition,
          )
          .sort(
            (
              first,
              second,
            ) =>
              first.order -
              second.order,
          );

      if (
        chartDefinitions.length === 0
      ) {
        throw new Error(
          "No rendered charts were found.",
        );
      }

      for (
        let index = 0;
        index <
        chartDefinitions.length;
        index += 1
      ) {
        const chart =
          chartDefinitions[index];

        await exportSvgAsPng({
          svg: chart.svg,

          width: chart.width,
          height: chart.height,

          filename:
            chart.filename,
        });

        setCompletedCount(
          index + 1,
        );

        /*
         * A short pause prevents several browser
         * downloads from starting in the same
         * event-loop cycle.
         */
        await pause(200);
      }

      setResultMessage(
        `${chartDefinitions.length} ${
          chartDefinitions.length === 1
            ? "chart was"
            : "charts were"
        } generated.`,
      );
    } catch (error) {
      console.error(
        "Bulk chart export failed:",
        error,
      );

      setErrorMessage(
        "The chart package could not be generated.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={
          handleDownloadAll
        }
        disabled={
          isDownloading ||
          availableChartCount === 0
        }
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isDownloading
          ? `Downloading ${completedCount}/${availableChartCount}…`
          : `Download all charts (${availableChartCount})`}
      </button>

      {resultMessage && (
        <p className="text-xs text-emerald-700">
          {resultMessage}
        </p>
      )}

      {errorMessage && (
        <p className="text-xs text-red-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
}