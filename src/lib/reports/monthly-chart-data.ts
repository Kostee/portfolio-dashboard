import type { Database } from "@/types/database.types";

type ReportRunRow =
  Database["public"]["Tables"]["portfolio_report_runs"]["Row"];

type ReportItemRow =
  Database["public"]["Tables"]["portfolio_report_items"]["Row"];

type XirrSnapshotRow =
  Database["public"]["Tables"]["portfolio_xirr_snapshots"]["Row"];

type PortfolioValueHistoryRow =
  Database["public"]["Tables"]["portfolio_value_history_points"]["Row"];

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

export type InstrumentOwnerBreakdown = {
  ownerId: string;
  ownerName: string;
  marketValueBase: number;
  percentage: number;
};

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

  ownerBreakdown: InstrumentOwnerBreakdown[];
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

export type PortfolioValueHistoryRecord = Pick<
  PortfolioValueHistoryRow,
  | "id"
  | "workspace_id"
  | "as_of_date"
  | "total_value_base"
  | "cumulative_contributions_base"
  | "base_currency"
  | "source"
  | "notes"
>;

export type PortfolioHistoryPoint = {
  historyPointId: string;
  reportRunId: string | null;
  asOfDate: string;
  revision: number | null;
  status: string;
  source: "historical" | "report";

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
  legacyHistoryPoints: PortfolioValueHistoryRecord[];
  xirrSnapshots: MonthlyXirrSnapshot[];
};

type MutableInstrumentOwner = {
  ownerId: string;
  ownerName: string;
  marketValueBase: number;
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

  ownerMarketValues: Map<
    string,
    MutableInstrumentOwner
  >;
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

function addInstrumentOwnerValue(
  group: MutableInstrumentGroup,
  item: MonthlyReportItem,
): void {
  const ownerValue =
    numberValue(
      item.market_value_base,
    );

  const existingOwner =
    group.ownerMarketValues.get(
      item.owner_id,
    );

  if (existingOwner) {
    existingOwner.marketValueBase +=
      ownerValue;

    return;
  }

  group.ownerMarketValues.set(
    item.owner_id,
    {
      ownerId: item.owner_id,
      ownerName: item.owner_name,
      marketValueBase: ownerValue,
    },
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

      addInstrumentOwnerValue(
        existing,
        item,
      );

      continue;
    }

    const group: MutableInstrumentGroup = {
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

      ownerMarketValues:
        new Map(),
    };

    addInstrumentOwnerValue(
      group,
      item,
    );

    groups.set(
      item.instrument_id,
      group,
    );
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
    .map((group) => {
      const ownerBreakdown =
        [...group.ownerMarketValues.values()]
          .map((owner) => ({
            ownerId: owner.ownerId,
            ownerName: owner.ownerName,
            marketValueBase:
              owner.marketValueBase,
            percentage:
              calculatePercentage(
                owner.marketValueBase,
                group.marketValueBase,
              ),
          }))
          .sort(
            (first, second) =>
              second.marketValueBase -
              first.marketValueBase,
          );

      return {
        instrumentId:
          group.instrumentId,
        instrumentName:
          group.instrumentName,
        instrumentTicker:
          group.instrumentTicker,
        instrumentExchange:
          group.instrumentExchange,

        assetClassId:
          group.assetClassId,
        assetClassName:
          group.assetClassName,
        assetClassCode:
          group.assetClassCode,
        assetClassColor:
          group.assetClassColor,
        assetClassSortOrder:
          group.assetClassSortOrder,

        quantity:
          group.quantity,
        marketValue:
          group.marketValue,
        currency:
          group.currency,
        marketValueBase:
          group.marketValueBase,

        percentage:
          calculatePercentage(
            group.marketValueBase,
            totalValueBase,
          ),

        ownerBreakdown,
      };
    })
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

function getAccountSortOrder(
  item: AccountChartItem,
): number {
  const accountType =
    item.accountType.toLowerCase();

  const accountName =
    item.accountName.toLowerCase();

  if (
    accountType.includes("government") ||
    accountName.includes("government") ||
    accountName.includes("bond")
  ) {
    return 0;
  }

  if (accountType.includes("ike")) {
    return 1;
  }

  if (accountType.includes("ikze")) {
    return 2;
  }

  if (accountType.includes("broker")) {
    return 3;
  }

  if (accountType.includes("ppk")) {
    return 4;
  }

  if (
    accountType.includes("crypto") ||
    accountName.includes("crypto")
  ) {
    return 5;
  }

  return 99;
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
        getAccountSortOrder(first) -
          getAccountSortOrder(second) ||
        first.ownerName.localeCompare(
          second.ownerName,
        ) ||
        first.accountName.localeCompare(
          second.accountName,
        ),
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
        second.marketValueBase -
          first.marketValueBase ||
        first.assetClassName.localeCompare(
          second.assetClassName,
        ),
    );

  return {
    totalValueBase,
    items: chartItems,
  };
}

function buildHistoryChart(
  reportAsOfDate: string,
  historyRuns: MonthlyReportRun[],
  legacyHistoryPoints: PortfolioValueHistoryRecord[],
): {
  points: PortfolioHistoryPoint[];
  contributionsAvailable: boolean;
} {
  type Candidate = {
    point: PortfolioHistoryPoint;
    priority: number;
  };

  const pointByDate =
    new Map<string, Candidate>();

  for (
    const historicalPoint of
      legacyHistoryPoints
  ) {
    if (
      historicalPoint.as_of_date >
      reportAsOfDate
    ) {
      continue;
    }

    const totalValueBase =
      numberValue(
        historicalPoint.total_value_base,
      );

    const cumulativeContributionsBase =
      optionalNumberValue(
        historicalPoint
          .cumulative_contributions_base,
      );

    pointByDate.set(
      historicalPoint.as_of_date,
      {
        priority: 1,

        point: {
          historyPointId:
            `historical:${historicalPoint.id}`,

          reportRunId: null,

          asOfDate:
            historicalPoint.as_of_date,

          revision: null,
          status: "historical",
          source: "historical",

          totalValueBase,
          cumulativeContributionsBase,

          portfolioGainBase:
            cumulativeContributionsBase ===
            null
              ? null
              : totalValueBase -
                cumulativeContributionsBase,
        },
      },
    );
  }

  const latestRevisionByDate =
    new Map<
      string,
      MonthlyReportRun
    >();

  for (const run of historyRuns) {
    if (
      run.report_type !== "monthly" ||
      run.status === "voided" ||
      run.as_of_date >
        reportAsOfDate
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

  for (
    const run of
      latestRevisionByDate.values()
  ) {
    const totalValueBase =
      numberValue(
        run.total_value_base,
      );

    const cumulativeContributionsBase =
      optionalNumberValue(
        run.cumulative_contributions_base,
      );

    pointByDate.set(
      run.as_of_date,
      {
        priority: 2,

        point: {
          historyPointId:
            `report:${run.id}`,

          reportRunId: run.id,

          asOfDate:
            run.as_of_date,

          revision:
            run.revision,

          status: run.status,
          source: "report",

          totalValueBase,
          cumulativeContributionsBase,

          portfolioGainBase:
            cumulativeContributionsBase ===
            null
              ? null
              : totalValueBase -
                cumulativeContributionsBase,
        },
      },
    );
  }

  const points =
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
  legacyHistoryPoints,
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
      buildHistoryChart(
        reportRun.as_of_date,
        historyRuns,
        legacyHistoryPoints,
      ),

    foreign:
      buildForeignChart(reportItems),
  };
}
