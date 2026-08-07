import type { Database } from "@/types/database.types";

type ReportRunRow =
  Database["public"]["Tables"]["portfolio_report_runs"]["Row"];

type ReportItemRow =
  Database["public"]["Tables"]["portfolio_report_items"]["Row"];

type XirrSnapshotRow =
  Database["public"]["Tables"]["portfolio_xirr_snapshots"]["Row"];

export type MonthlyReportRun = Pick<
  ReportRunRow,
  | "id"
  | "workspace_id"
  | "report_type"
  | "as_of_date"
  | "revision"
  | "status"
  | "base_currency"
  | "item_count"
  | "total_value_base"
  | "prepared_at"
  | "generated_at"
  | "contribution_baseline_id"
  | "contribution_baseline_date"
  | "cumulative_contributions_base"
>;

export type MonthlyReportItem = Pick<
  ReportItemRow,
  | "id"
  | "report_run_id"
  | "item_type"
  | "source_snapshot_date"
  | "account_id"
  | "owner_id"
  | "owner_name"
  | "provider_id"
  | "provider_name"
  | "account_name"
  | "account_type"
  | "account_currency"
  | "instrument_id"
  | "instrument_name"
  | "instrument_ticker"
  | "instrument_kind"
  | "tracking_mode"
  | "instrument_exchange"
  | "asset_class_id"
  | "asset_class_name"
  | "asset_class_code"
  | "asset_class_color"
  | "asset_class_sort_order"
  | "quantity"
  | "unit_price"
  | "market_value"
  | "currency"
  | "market_value_base"
>;

export type InstrumentChartItem = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;
  instrumentExchange: string | null;

  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  quantity: number;
  marketValue: number;
  currency: string;
  marketValueBase: number;
  percentage: number;
};

export type AccountChartItem = {
  accountId: string;
  ownerId: string;
  ownerName: string;

  providerId: string;
  providerName: string;

  accountName: string;
  accountType: string;
  accountCurrency: string;

  marketValueBase: number;
  percentage: number;
};

export type AssetClassChartItem = {
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  marketValueBase: number;
  percentage: number;
  itemCount: number;
};

export type MonthlyXirrSnapshot = Pick<
  XirrSnapshotRow,
  | "id"
  | "workspace_id"
  | "report_run_id"
  | "as_of_date"
  | "xirr_rate"
  | "terminal_value_base"
  | "terminal_invested_value_base"
  | "terminal_cash_value_base"
  | "cash_flow_count"
  | "calculation_version"
  | "created_at"
>;

export type XirrHistoryPoint = {
  xirrSnapshotId: string;
  reportRunId: string | null;
  asOfDate: string;
  revision: number | null;
  xirrRate: number;
  calculationVersion: string;
};

export type FrozenXirrSummary = {
  xirrSnapshotId: string;
  xirrRate: number;

  terminalInvestedValueBase: number | null;
  terminalCashValueBase: number | null;
  terminalValueBase: number | null;

  cashFlowCount: number | null;
  calculationVersion: string;
};

export type PortfolioHistoryPoint = {
  reportRunId: string;
  asOfDate: string;
  revision: number;
  status: string;

  totalValueBase: number;
  cumulativeContributionsBase: number | null;
  portfolioGainBase: number | null;
};

export type ForeignCurrencyTotal = {
  currency: string;
  marketValue: number;
};

export type ForeignChartGroup = {
  assetClassName: string;
  assetClassCode: string;
  assetClassColor: string;
  assetClassSortOrder: number;

  marketValueBase: number;
  percentage: number;

  items: InstrumentChartItem[];
};

export type MonthlyChartData = {
  report: {
    reportRunId: string;
    asOfDate: string;
    revision: number;
    baseCurrency: string;

    frozenItemCount: number;
    frozenTotalValueBase: number;
    calculatedTotalValueBase: number;

    totalDifference: number;
    totalMatches: boolean;

    contributionBaselineDate: string | null;
    cumulativeContributionsBase: number | null;
    portfolioGainBase: number | null;
  };

  xirr: {
    current: FrozenXirrSummary | null;
    history: XirrHistoryPoint[];
  };

  gpw: {
    totalValueBase: number;
    items: InstrumentChartItem[];
  };

  accounts: {
    totalValueBase: number;
    items: AccountChartItem[];
  };

  assetClasses: {
    totalValueBase: number;
    items: AssetClassChartItem[];
  };

  history: {
    points: PortfolioHistoryPoint[];
    contributionsAvailable: boolean;
  };

  foreign: {
    totalValueBase: number;
    currencyTotals: ForeignCurrencyTotal[];
    groups: ForeignChartGroup[];
  };
};

type BuildMonthlyChartDataInput = {
  reportRun: MonthlyReportRun;
  reportItems: MonthlyReportItem[];
  historyRuns: MonthlyReportRun[];
  xirrSnapshots: MonthlyXirrSnapshot[];
};

type MutableInstrumentGroup = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;
  instrumentExchange: string | null;

  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  quantity: number;
  marketValue: number;
  currency: string;
  marketValueBase: number;
};

type MutableAccountGroup = {
  accountId: string;
  ownerId: string;
  ownerName: string;

  providerId: string;
  providerName: string;

  accountName: string;
  accountType: string;
  accountCurrency: string;

  marketValueBase: number;
};

type MutableAssetClassGroup = {
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  marketValueBase: number;
  itemCount: number;
};

const FOREIGN_ASSET_CLASS_CODES =
  new Set([
    "global_etfs",
    "us_reits",
    "semiconductor_stocks",
  ]);

const FALLBACK_ASSET_COLOR =
  "#64748B";

function numberValue(
  value: number | null,
): number {
  return Number(value ?? 0);
}

function optionalNumberValue(
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
}

function calculatePercentage(
  value: number,
  total: number,
): number {
  if (total === 0) {
    return 0;
  }

  return (value / total) * 100;
}

function sumBaseValue(
  items: MonthlyReportItem[],
): number {
  return items.reduce(
    (sum, item) =>
      sum +
      numberValue(
        item.market_value_base,
      ),
    0,
  );
}

function aggregateInstruments(
  items: MonthlyReportItem[],
): MutableInstrumentGroup[] {
  const groups =
    new Map<
      string,
      MutableInstrumentGroup
    >();

  for (const item of items) {
    const existing =
      groups.get(item.instrument_id);

    if (existing) {
      existing.quantity +=
        numberValue(item.quantity);

      existing.marketValue +=
        numberValue(item.market_value);

      existing.marketValueBase +=
        numberValue(
          item.market_value_base,
        );

      continue;
    }

    groups.set(item.instrument_id, {
      instrumentId:
        item.instrument_id,

      instrumentName:
        item.instrument_name,

      instrumentTicker:
        item.instrument_ticker,

      instrumentExchange:
        item.instrument_exchange,

      assetClassId:
        item.asset_class_id,

      assetClassName:
        item.asset_class_name ??
        "Unclassified assets",

      assetClassCode:
        item.asset_class_code,

      assetClassColor:
        item.asset_class_color ??
        FALLBACK_ASSET_COLOR,

      assetClassSortOrder:
        item.asset_class_sort_order ??
        999,

      quantity:
        numberValue(item.quantity),

      marketValue:
        numberValue(item.market_value),

      currency:
        item.currency,

      marketValueBase:
        numberValue(
          item.market_value_base,
        ),
    });
  }

  return [...groups.values()];
}

function buildInstrumentChartItems(
  items: MonthlyReportItem[],
): {
  totalValueBase: number;
  items: InstrumentChartItem[];
} {
  const groups =
    aggregateInstruments(items);

  const totalValueBase =
    groups.reduce(
      (sum, group) =>
        sum + group.marketValueBase,
      0,
    );

  const chartItems = groups
    .map((group) => ({
      ...group,

      percentage:
        calculatePercentage(
          group.marketValueBase,
          totalValueBase,
        ),
    }))
    .sort(
      (first, second) =>
        second.marketValueBase -
        first.marketValueBase,
    );

  return {
    totalValueBase,
    items: chartItems,
  };
}

function buildAccountChart(
  items: MonthlyReportItem[],
): {
  totalValueBase: number;
  items: AccountChartItem[];
} {
  const groups =
    new Map<
      string,
      MutableAccountGroup
    >();

  for (const item of items) {
    const existing =
      groups.get(item.account_id);

    if (existing) {
      existing.marketValueBase +=
        numberValue(
          item.market_value_base,
        );

      continue;
    }

    groups.set(item.account_id, {
      accountId: item.account_id,

      ownerId: item.owner_id,
      ownerName: item.owner_name,

      providerId: item.provider_id,
      providerName:
        item.provider_name,

      accountName:
        item.account_name,

      accountType:
        item.account_type,

      accountCurrency:
        item.account_currency,

      marketValueBase:
        numberValue(
          item.market_value_base,
        ),
    });
  }

  const mutableItems =
    [...groups.values()];

  const totalValueBase =
    mutableItems.reduce(
      (sum, item) =>
        sum + item.marketValueBase,
      0,
    );

  const chartItems = mutableItems
    .map((item) => ({
      ...item,

      percentage:
        calculatePercentage(
          item.marketValueBase,
          totalValueBase,
        ),
    }))
    .sort(
      (first, second) =>
        second.marketValueBase -
        first.marketValueBase,
    );

  return {
    totalValueBase,
    items: chartItems,
  };
}

function buildAssetClassChart(
  items: MonthlyReportItem[],
): {
  totalValueBase: number;
  items: AssetClassChartItem[];
} {
  const groups =
    new Map<
      string,
      MutableAssetClassGroup
    >();

  for (const item of items) {
    const key =
      item.asset_class_code ??
      item.asset_class_id ??
      "unclassified";

    const existing =
      groups.get(key);

    if (existing) {
      existing.marketValueBase +=
        numberValue(
          item.market_value_base,
        );

      existing.itemCount += 1;

      continue;
    }

    groups.set(key, {
      assetClassId:
        item.asset_class_id,

      assetClassName:
        item.asset_class_name ??
        "Unclassified assets",

      assetClassCode:
        item.asset_class_code,

      assetClassColor:
        item.asset_class_color ??
        FALLBACK_ASSET_COLOR,

      assetClassSortOrder:
        item.asset_class_sort_order ??
        999,

      marketValueBase:
        numberValue(
          item.market_value_base,
        ),

      itemCount: 1,
    });
  }

  const mutableItems =
    [...groups.values()];

  const totalValueBase =
    mutableItems.reduce(
      (sum, item) =>
        sum + item.marketValueBase,
      0,
    );

  const chartItems = mutableItems
    .map((item) => ({
      ...item,

      percentage:
        calculatePercentage(
          item.marketValueBase,
          totalValueBase,
        ),
    }))
    .sort(
      (first, second) =>
        first.assetClassSortOrder -
          second.assetClassSortOrder ||
        second.marketValueBase -
          first.marketValueBase,
    );

  return {
    totalValueBase,
    items: chartItems,
  };
}

function buildHistoryChart(
  historyRuns: MonthlyReportRun[],
): {
  points: PortfolioHistoryPoint[];
  contributionsAvailable: boolean;
} {
  const latestRevisionByDate =
    new Map<
      string,
      MonthlyReportRun
    >();

  for (const run of historyRuns) {
    if (
      run.report_type !== "monthly" ||
      run.status === "voided"
    ) {
      continue;
    }

    const existing =
      latestRevisionByDate.get(
        run.as_of_date,
      );

    if (
      !existing ||
      run.revision >
        existing.revision
    ) {
      latestRevisionByDate.set(
        run.as_of_date,
        run,
      );
    }
  }

  const points =
    [...latestRevisionByDate.values()]
      .sort((first, second) =>
        first.as_of_date.localeCompare(
          second.as_of_date,
        ),
      )
      .map((run) => {
        const totalValueBase =
          numberValue(
            run.total_value_base,
          );

        const cumulativeContributionsBase =
          optionalNumberValue(
            run.cumulative_contributions_base,
          );

        return {
          reportRunId: run.id,
          asOfDate: run.as_of_date,
          revision: run.revision,
          status: run.status,

          totalValueBase,
          cumulativeContributionsBase,

          portfolioGainBase:
            cumulativeContributionsBase ===
            null
              ? null
              : totalValueBase -
                cumulativeContributionsBase,
        };
      });

  return {
    points,
    contributionsAvailable:
      points.some(
        (point) =>
          point
            .cumulativeContributionsBase !==
          null,
      ),
  };
}

function buildXirrData(
  reportRun: MonthlyReportRun,
  historyRuns: MonthlyReportRun[],
  xirrSnapshots: MonthlyXirrSnapshot[],
): {
  current: FrozenXirrSummary | null;
  history: XirrHistoryPoint[];
} {
  const latestRunByDate =
    new Map<
      string,
      MonthlyReportRun
    >();

  const runById =
    new Map<
      string,
      MonthlyReportRun
    >();

  for (const run of historyRuns) {
    runById.set(run.id, run);

    if (
      run.report_type !== "monthly" ||
      run.status === "voided"
    ) {
      continue;
    }

    const existing =
      latestRunByDate.get(
        run.as_of_date,
      );

    if (
      !existing ||
      run.revision >
        existing.revision
    ) {
      latestRunByDate.set(
        run.as_of_date,
        run,
      );
    }
  }

  const currentSnapshot =
    xirrSnapshots.find(
      (snapshot) =>
        snapshot.report_run_id ===
        reportRun.id,
    ) ?? null;

  const current =
    currentSnapshot === null
      ? null
      : {
          xirrSnapshotId:
            currentSnapshot.id,

          xirrRate:
            numberValue(
              currentSnapshot.xirr_rate,
            ),

          terminalInvestedValueBase:
            optionalNumberValue(
              currentSnapshot
                .terminal_invested_value_base,
            ),

          terminalCashValueBase:
            optionalNumberValue(
              currentSnapshot
                .terminal_cash_value_base,
            ),

          terminalValueBase:
            optionalNumberValue(
              currentSnapshot
                .terminal_value_base,
            ),

          cashFlowCount:
            currentSnapshot
              .cash_flow_count,

          calculationVersion:
            currentSnapshot
              .calculation_version,
        };

  type Candidate = {
    point: XirrHistoryPoint;
    priority: number;
  };

  const pointByDate =
    new Map<string, Candidate>();

  for (
    const snapshot of xirrSnapshots
  ) {
    let revision: number | null =
      null;

    let priority = 1;

    if (snapshot.report_run_id) {
      const linkedRun =
        runById.get(
          snapshot.report_run_id,
        );

      if (
        !linkedRun ||
        linkedRun.report_type !==
          "monthly" ||
        linkedRun.status ===
          "voided"
      ) {
        continue;
      }

      const latestRun =
        latestRunByDate.get(
          snapshot.as_of_date,
        );

      if (
        !latestRun ||
        latestRun.id !==
          snapshot.report_run_id
      ) {
        continue;
      }

      revision =
        linkedRun.revision;

      priority = 2;
    }

    const candidate: Candidate = {
      priority,

      point: {
        xirrSnapshotId:
          snapshot.id,

        reportRunId:
          snapshot.report_run_id,

        asOfDate:
          snapshot.as_of_date,

        revision,

        xirrRate:
          numberValue(
            snapshot.xirr_rate,
          ),

        calculationVersion:
          snapshot.calculation_version,
      },
    };

    const existing =
      pointByDate.get(
        snapshot.as_of_date,
      );

    if (
      !existing ||
      candidate.priority >
        existing.priority ||
      (
        candidate.priority ===
          existing.priority &&
        (
          candidate.point.revision ??
          -1
        ) >
          (
            existing.point.revision ??
            -1
          )
      )
    ) {
      pointByDate.set(
        snapshot.as_of_date,
        candidate,
      );
    }
  }

  const history =
    [...pointByDate.values()]
      .map(
        (candidate) =>
          candidate.point,
      )
      .sort((first, second) =>
        first.asOfDate.localeCompare(
          second.asOfDate,
        ),
      );

  return {
    current,
    history,
  };
}

function buildForeignChart(
  items: MonthlyReportItem[],
): {
  totalValueBase: number;
  currencyTotals: ForeignCurrencyTotal[];
  groups: ForeignChartGroup[];
} {
  const foreignItems =
    items.filter(
      (item) =>
        item.asset_class_code !==
          null &&
        FOREIGN_ASSET_CLASS_CODES.has(
          item.asset_class_code,
        ),
    );

  const instrumentData =
    buildInstrumentChartItems(
      foreignItems,
    );

  const currencyMap =
    new Map<string, number>();

  for (const item of foreignItems) {
    currencyMap.set(
      item.currency,
      (currencyMap.get(
        item.currency,
      ) ?? 0) +
        numberValue(item.market_value),
    );
  }

  const currencyTotals =
    [...currencyMap.entries()]
      .map(
        ([
          currency,
          marketValue,
        ]) => ({
          currency,
          marketValue,
        }),
      )
      .sort((first, second) =>
        first.currency.localeCompare(
          second.currency,
        ),
      );

  const groupsMap =
    new Map<
      string,
      ForeignChartGroup
    >();

  for (
    const item of instrumentData.items
  ) {
    const groupCode =
      item.assetClassCode ??
      "unclassified";

    const existing =
      groupsMap.get(groupCode);

    if (existing) {
      existing.marketValueBase +=
        item.marketValueBase;

      existing.items.push(item);

      continue;
    }

    groupsMap.set(groupCode, {
      assetClassName:
        item.assetClassName,

      assetClassCode:
        groupCode,

      assetClassColor:
        item.assetClassColor,

      assetClassSortOrder:
        item.assetClassSortOrder,

      marketValueBase:
        item.marketValueBase,

      percentage: 0,

      items: [item],
    });
  }

  const groups =
    [...groupsMap.values()]
      .map((group) => ({
        ...group,

        percentage:
          calculatePercentage(
            group.marketValueBase,
            instrumentData.totalValueBase,
          ),

        items: [...group.items].sort(
          (first, second) =>
            second.marketValueBase -
            first.marketValueBase,
        ),
      }))
      .sort(
        (first, second) =>
          first.assetClassSortOrder -
            second.assetClassSortOrder ||
          second.marketValueBase -
            first.marketValueBase,
      );

  return {
    totalValueBase:
      instrumentData.totalValueBase,

    currencyTotals,
    groups,
  };
}

export function buildMonthlyChartData({
  reportRun,
  reportItems,
  historyRuns,
  xirrSnapshots,
}: BuildMonthlyChartDataInput): MonthlyChartData {
  const calculatedTotalValueBase =
    sumBaseValue(reportItems);

  const frozenTotalValueBase =
    numberValue(
      reportRun.total_value_base,
    );

  const totalDifference =
    calculatedTotalValueBase -
    frozenTotalValueBase;

  const cumulativeContributionsBase =
    optionalNumberValue(
      reportRun
        .cumulative_contributions_base,
    );

  const portfolioGainBase =
    cumulativeContributionsBase === null
      ? null
      : frozenTotalValueBase -
        cumulativeContributionsBase;

  const gpwItems =
    reportItems.filter(
      (item) =>
        item.asset_class_code ===
        "polish_stocks",
    );

  return {
    report: {
      reportRunId: reportRun.id,

      asOfDate:
        reportRun.as_of_date,

      revision:
        reportRun.revision,

      baseCurrency:
        reportRun.base_currency,

      frozenItemCount:
        reportRun.item_count,

      frozenTotalValueBase,
      calculatedTotalValueBase,

      totalDifference,

      totalMatches:
        Math.abs(totalDifference) <=
        0.01,

      contributionBaselineDate:
        reportRun
          .contribution_baseline_date,

      cumulativeContributionsBase,
      portfolioGainBase,
    },

    xirr:
      buildXirrData(
        reportRun,
        historyRuns,
        xirrSnapshots,
      ),

    gpw:
      buildInstrumentChartItems(
        gpwItems,
      ),

    accounts:
      buildAccountChart(reportItems),

    assetClasses:
      buildAssetClassChart(
        reportItems,
      ),

    history:
      buildHistoryChart(historyRuns),

    foreign:
      buildForeignChart(reportItems),
  };
}