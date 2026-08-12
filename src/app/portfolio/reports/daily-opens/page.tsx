import Link from "next/link";
import { redirect } from "next/navigation";

import {
  DailyOpenHistoryChart,
} from "@/components/reports/daily-opens/daily-open-history-chart";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type DailyOpenPrice =
  Database["public"]["Tables"]["instrument_daily_open_prices"]["Row"];

type DailyOpenRun =
  Database["public"]["Tables"]["daily_market_open_sync_runs"]["Row"];

type Instrument =
  Database["public"]["Tables"]["instruments"]["Row"];

type DailyOpensPageProps = {
  searchParams: Promise<{
    date?: string;
    instrument?: string;
  }>;
};

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: number): string {
  const formatted = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (value > 0) {
    return `+${formatted}%`;
  }

  if (value < 0) {
    return `-${formatted}%`;
  }

  return "0.00%";
}

function formatFetchedAt(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function getExchangeOrder(exchange: string | null): number {
  switch (exchange) {
    case "GPW":
      return 1;
    case "XETRA":
      return 2;
    case "LSE":
      return 3;
    case "NASDAQ":
      return 4;
    case "NYSE":
      return 5;
    default:
      return 99;
  }
}

type PreviousOpenInfo = {
  tradingDate: string;
  openPrice: number;
};

async function loadPreviousOpenPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  instrumentIds: string[],
  selectedDate: string | null,
): Promise<Map<string, PreviousOpenInfo>> {
  const previousByInstrument = new Map<string, PreviousOpenInfo>();

  if (!selectedDate || instrumentIds.length === 0) {
    return previousByInstrument;
  }

  const { data, error } = await supabase
    .from("instrument_daily_open_prices")
    .select("instrument_id, trading_date, open_price")
    .eq("workspace_id", workspaceId)
    .in("instrument_id", instrumentIds)
    .lt("trading_date", selectedDate)
    .order("trading_date", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Previous daily open query failed:", error);
    return previousByInstrument;
  }

  for (const row of data ?? []) {
    if (previousByInstrument.has(row.instrument_id)) {
      continue;
    }

    previousByInstrument.set(row.instrument_id, {
      tradingDate: row.trading_date,
      openPrice: Number(row.open_price),
    });
  }

  return previousByInstrument;
}

async function loadAllOpenHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  instrumentId: string,
): Promise<DailyOpenPrice[]> {
  const pageSize = 1000;
  const result: DailyOpenPrice[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("instrument_daily_open_prices")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("instrument_id", instrumentId)
      .order("trading_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Daily open history query failed:", error);
      break;
    }

    const rows = data ?? [];
    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  return result;
}

export default async function DailyOpensPage({
  searchParams,
}: DailyOpensPageProps) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Workspace membership query failed:", membershipError);
  }

  if (!membership) {
    redirect("/portfolio");
  }

  const params = await searchParams;

  const [workspaceResult, runsResult] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .single(),

    supabase
      .from("daily_market_open_sync_runs")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .order("trading_date", { ascending: false })
      .order("started_at", { ascending: false }),
  ]);

  if (workspaceResult.error) {
    console.error("Workspace query failed:", workspaceResult.error);
  }

  if (runsResult.error) {
    console.error("Daily open run query failed:", runsResult.error);
  }

  const runs = (runsResult.data ?? []) as DailyOpenRun[];

  const availableDates = [
    ...new Set(runs.map((run) => run.trading_date)),
  ].sort((first, second) => second.localeCompare(first));

  const requestedDate = isIsoDate(params.date)
    ? params.date
    : null;

  const selectedDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0] ?? null;

  const selectedDateRuns = selectedDate
    ? runs.filter((run) => run.trading_date === selectedDate)
    : [];

  let dayPrices: DailyOpenPrice[] = [];

  if (selectedDate) {
    const { data, error } = await supabase
      .from("instrument_daily_open_prices")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .eq("trading_date", selectedDate)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Daily open price query failed:", error);
    } else {
      dayPrices = (data ?? []) as DailyOpenPrice[];
    }
  }

  const instrumentIds = [
    ...new Set(dayPrices.map((price) => price.instrument_id)),
  ];

  let instruments: Instrument[] = [];

  const previousOpenByInstrument = await loadPreviousOpenPrices(
    supabase,
    membership.workspace_id,
    instrumentIds,
    selectedDate,
  );

  if (instrumentIds.length > 0) {
    const { data, error } = await supabase
      .from("instruments")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .in("id", instrumentIds);

    if (error) {
      console.error("Instrument query failed:", error);
    } else {
      instruments = (data ?? []) as Instrument[];
    }
  }

  const instrumentById = new Map(
    instruments.map((instrument) => [instrument.id, instrument]),
  );

  const sortedPrices = [...dayPrices].sort((first, second) => {
    const firstInstrument = instrumentById.get(first.instrument_id);
    const secondInstrument = instrumentById.get(second.instrument_id);

    const exchangeDifference =
      getExchangeOrder(firstInstrument?.exchange ?? null) -
      getExchangeOrder(secondInstrument?.exchange ?? null);

    if (exchangeDifference !== 0) {
      return exchangeDifference;
    }

    return (
      firstInstrument?.ticker ??
      firstInstrument?.name ??
      ""
    ).localeCompare(
      secondInstrument?.ticker ??
        secondInstrument?.name ??
        "",
    );
  });

  const selectedInstrumentId =
    params.instrument && instrumentById.has(params.instrument)
      ? params.instrument
      : sortedPrices[0]?.instrument_id ?? null;

  const selectedInstrument = selectedInstrumentId
    ? instrumentById.get(selectedInstrumentId) ?? null
    : null;

  const history = selectedInstrumentId
    ? await loadAllOpenHistory(
        supabase,
        membership.workspace_id,
        selectedInstrumentId,
      )
    : [];

  const groupedPrices = sortedPrices.reduce(
    (groups, price) => {
      const instrument = instrumentById.get(price.instrument_id);
      const exchange = instrument?.exchange ?? "Other";
      const existing = groups.get(exchange) ?? [];

      existing.push(price);
      groups.set(exchange, existing);

      return groups;
    },
    new Map<string, DailyOpenPrice[]>(),
  );

  const exchangeGroups = [...groupedPrices.entries()].sort(
    ([first], [second]) =>
      getExchangeOrder(first) - getExchangeOrder(second),
  );

  const latestEuropeRun =
    selectedDateRuns.find((run) => run.market_region === "europe") ??
    null;

  const latestUsRun =
    selectedDateRuns.find((run) => run.market_region === "us") ??
    null;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/portfolio/reports"
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            ← Reports
          </Link>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Daily market data
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Daily market opens
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Workspace:{" "}
            {workspaceResult.data?.name ?? "Portfolio workspace"}
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Trading day</h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Opening prices are stored permanently. Select any collected
                trading day to inspect the exact records saved for that
                session.
              </p>
            </div>

            <form
              method="get"
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <label className="text-sm font-medium text-slate-700">
                Date
                <select
                  name="date"
                  defaultValue={selectedDate ?? ""}
                  className="mt-1 block min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {availableDates.length > 0 ? (
                    availableDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))
                  ) : (
                    <option value="">No data yet</option>
                  )}
                </select>
              </label>

              {selectedInstrumentId && (
                <input
                  type="hidden"
                  name="instrument"
                  value={selectedInstrumentId}
                />
              )}

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Show day
              </button>
            </form>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            {
              label: "Europe",
              markets: "GPW · XETRA · LSE",
              run: latestEuropeRun,
            },
            {
              label: "United States",
              markets: "NASDAQ · NYSE",
              run: latestUsRun,
            },
          ].map(({ label, markets, run }) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{label}</p>

                  <p className="mt-1 text-xs text-slate-500">
                    {markets}
                  </p>
                </div>

                <span
                  className={
                    run?.status === "completed"
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                      : run
                        ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                        : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  }
                >
                  {run?.status ?? "No run"}
                </span>
              </div>

              {run ? (
                <>
                  <p className="mt-4 text-2xl font-semibold">
                    {run.instrument_success_count} success
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {run.instrument_skipped_count} skipped ·{" "}
                    {run.instrument_failure_count} failed
                  </p>

                  <p className="mt-3 text-xs text-slate-500">
                    Trigger: {run.trigger_source}
                    {" · "}
                    Completed: {formatFetchedAt(run.completed_at)}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  No synchronization run is stored for this region on the
                  selected trading day.
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Opening prices</h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {selectedDate
                  ? `${sortedPrices.length} stored opening-price records for ${selectedDate}.`
                  : "No daily opening-price history has been collected yet."}
              </p>
            </div>

            {sortedPrices.length > 0 && (
              <form
                method="get"
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                {selectedDate && (
                  <input type="hidden" name="date" value={selectedDate} />
                )}

                <label className="text-sm font-medium text-slate-700">
                  Instrument history
                  <select
                    name="instrument"
                    defaultValue={selectedInstrumentId ?? ""}
                    className="mt-1 block min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {sortedPrices.map((price) => {
                      const instrument = instrumentById.get(
                        price.instrument_id,
                      );

                      return (
                        <option
                          key={price.instrument_id}
                          value={price.instrument_id}
                        >
                          {instrument?.ticker ??
                            instrument?.name ??
                            "Instrument"}
                          {" · "}
                          {instrument?.exchange ?? "—"}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Show history
                </button>
              </form>
            )}
          </div>

          {exchangeGroups.length > 0 ? (
            <div className="mt-6 space-y-7">
              {exchangeGroups.map(([exchange, prices]) => (
                <div key={exchange}>
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {exchange}
                    </h3>

                    <span className="text-xs text-slate-500">
                      {prices.length}{" "}
                      {prices.length === 1 ? "instrument" : "instruments"}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3 font-medium">
                              Instrument
                            </th>

                            <th className="px-4 py-3 text-right font-medium">
                              Open
                            </th>

                            <th className="px-4 py-3 text-right font-medium">
                              Vs prev. open
                            </th>

                            <th className="px-4 py-3 font-medium">
                              Provider
                            </th>

                            <th className="px-4 py-3 font-medium">
                              Fetched
                            </th>

                            <th className="px-4 py-3 text-right font-medium">
                              History
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 bg-white">
                          {prices.map((price) => {
                            const instrument = instrumentById.get(
                              price.instrument_id,
                            );

                            const ticker =
                              instrument?.ticker ??
                              instrument?.name ??
                              "Instrument";

                            const historyHref =
                              `/portfolio/reports/daily-opens?date=${encodeURIComponent(
                                selectedDate ?? price.trading_date,
                              )}&instrument=${encodeURIComponent(
                                price.instrument_id,
                              )}`;

                            const previousOpen = previousOpenByInstrument.get(
                              price.instrument_id,
                            );

                            const currentOpen = Number(price.open_price);

                            const openChangePercent =
                              previousOpen && previousOpen.openPrice > 0
                                ? ((currentOpen / previousOpen.openPrice) - 1) *
                                  100
                                : null;

                            return (
                              <tr key={price.id}>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-900">
                                    {ticker}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {instrument?.name}
                                  </p>
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                                  {formatPrice(currentOpen)} {price.currency}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                  {openChangePercent === null ? (
                                    <div>
                                      <span className="text-sm font-medium text-slate-400">
                                        —
                                      </span>

                                      <p className="mt-1 text-[11px] text-slate-400">
                                        first observation
                                      </p>
                                    </div>
                                  ) : (
                                    <div>
                                      <span
                                        className={
                                          openChangePercent > 0
                                            ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                                            : openChangePercent < 0
                                              ? "inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
                                              : "inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                                        }
                                      >
                                        {formatPercent(openChangePercent)}
                                      </span>

                                      <p className="mt-1 text-[11px] text-slate-400">
                                        vs {previousOpen?.tradingDate}
                                      </p>
                                    </div>
                                  )}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                  {price.provider} · {price.provider_symbol}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                  {formatFetchedAt(price.fetched_at)}
                                </td>

                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                  <Link
                                    href={historyHref}
                                    className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                                  >
                                    View chart
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <p className="font-medium">
                No opening prices for this day
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Once the daily synchronization stores data for a trading
                session, the records will appear here.
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Permanent history
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Opening-price history by instrument
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            The line chart uses every stored daily opening price for the
            selected instrument, from the first collected trading day onward.
          </p>

          <div className="mt-6">
            {selectedInstrument ? (
              <DailyOpenHistoryChart
                ticker={
                  selectedInstrument.ticker ?? selectedInstrument.name
                }
                name={selectedInstrument.name}
                currency={
                  history[0]?.currency ??
                  selectedInstrument.default_currency
                }
                points={history.map((price) => ({
                  tradingDate: price.trading_date,
                  openPrice: Number(price.open_price),
                }))}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-medium">Select an instrument</p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Instrument history becomes available as soon as at least one
                  daily opening price is stored.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}