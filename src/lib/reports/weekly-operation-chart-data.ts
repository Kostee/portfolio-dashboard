import type {
  Database,
} from "@/types/database.types";

type WeeklyRunRow =
  Database["public"]["Tables"]["portfolio_weekly_report_runs"]["Row"];

type WeeklyItemRow =
  Database["public"]["Tables"]["portfolio_weekly_report_items"]["Row"];

export type WeeklyReportRun = Pick<
  WeeklyRunRow,
  | "id"
  | "workspace_id"
  | "from_date"
  | "to_date"
  | "base_currency"
  | "external_contributions_base"
  | "bought_base"
  | "sold_base"
  | "net_trading_base"
  | "fx_rates"
  | "item_count"
  | "generated_at"
>;

export type WeeklyReportItem = Pick<
  WeeklyItemRow,
  | "id"
  | "report_run_id"
  | "instrument_id"
  | "instrument_name"
  | "instrument_ticker"
  | "asset_class_id"
  | "asset_class_name"
  | "asset_class_code"
  | "asset_class_color"
  | "asset_class_sort_order"
  | "buy_quantity"
  | "sell_quantity"
  | "net_quantity"
  | "bought_base"
  | "sold_base"
  | "net_value_base"
  | "operation_count"
>;

export type WeeklyInstrumentChartItem = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;

  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;

  buyQuantity: number;
  sellQuantity: number;
  netQuantity: number;

  boughtBase: number;
  soldBase: number;
  netValueBase: number;
};

export type WeeklyAssetClassChartItem = {
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  boughtBase: number;
  soldBase: number;
  netValueBase: number;

  percentageOfNet: number;
  instrumentCount: number;
};

export type WeeklyOperationChartData = {
  report: {
    reportRunId: string;

    fromDate: string;
    toDate: string;

    baseCurrency: string;

    externalContributionsBase: number;

    boughtBase: number;
    soldBase: number;
    netTradingBase: number;
  };

  instruments: WeeklyInstrumentChartItem[];

  assetClasses: {
    items: WeeklyAssetClassChartItem[];

    positiveTotalBase: number;
    negativeTotalBase: number;
  };
};

type BuildWeeklyOperationChartDataInput = {
  reportRun: WeeklyReportRun;
  reportItems: WeeklyReportItem[];
};

type MutableAssetClass = {
  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  boughtBase: number;
  soldBase: number;
  netValueBase: number;

  instrumentIds: Set<string>;
};

export function buildWeeklyOperationChartData({
  reportRun,
  reportItems,
}: BuildWeeklyOperationChartDataInput): WeeklyOperationChartData {
  const instruments:
    WeeklyInstrumentChartItem[] =
    reportItems
      .map((item) => ({
        instrumentId:
          item.instrument_id,

        instrumentName:
          item.instrument_name,

        instrumentTicker:
          item.instrument_ticker,

        assetClassId:
          item.asset_class_id,

        assetClassName:
          item.asset_class_name,

        assetClassCode:
          item.asset_class_code,

        assetClassColor:
          item.asset_class_color,

        buyQuantity:
          Number(
            item.buy_quantity,
          ),

        sellQuantity:
          Number(
            item.sell_quantity,
          ),

        netQuantity:
          Number(
            item.net_quantity,
          ),

        boughtBase:
          Number(
            item.bought_base,
          ),

        soldBase:
          Number(
            item.sold_base,
          ),

        netValueBase:
          Number(
            item.net_value_base,
          ),
      }))
      .sort(
        (first, second) =>
          Math.abs(
            second.netValueBase,
          ) -
            Math.abs(
              first.netValueBase,
            ) ||
          (
            first.instrumentTicker ??
            first.instrumentName
          ).localeCompare(
            second.instrumentTicker ??
              second.instrumentName,
          ),
      );

  const mutableAssetClasses =
    new Map<
      string,
      MutableAssetClass
    >();

  for (const item of instruments) {
    const key =
      item.assetClassId ??
      `name:${item.assetClassName}`;

    let group =
      mutableAssetClasses.get(
        key,
      );

    if (!group) {
      const source =
        reportItems.find(
          (reportItem) =>
            reportItem.instrument_id ===
            item.instrumentId,
        );

      group = {
        assetClassId:
          item.assetClassId,

        assetClassName:
          item.assetClassName,

        assetClassCode:
          item.assetClassCode,

        assetClassColor:
          item.assetClassColor,

        assetClassSortOrder:
          source?.asset_class_sort_order ??
          999,

        boughtBase: 0,
        soldBase: 0,
        netValueBase: 0,

        instrumentIds:
          new Set<string>(),
      };

      mutableAssetClasses.set(
        key,
        group,
      );
    }

    group.boughtBase +=
      item.boughtBase;

    group.soldBase +=
      item.soldBase;

    group.netValueBase +=
      item.netValueBase;

    group.instrumentIds.add(
      item.instrumentId,
    );
  }

  const netTradingBase =
    Number(
      reportRun.net_trading_base,
    );

  const assetClasses =
    Array.from(
      mutableAssetClasses.values(),
    )
      .map(
        (
          group,
        ): WeeklyAssetClassChartItem => ({
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

          boughtBase:
            group.boughtBase,

          soldBase:
            group.soldBase,

          netValueBase:
            group.netValueBase,

          percentageOfNet:
            netTradingBase !== 0
              ? (
                  group.netValueBase /
                  netTradingBase
                ) *
                100
              : 0,

          instrumentCount:
            group.instrumentIds.size,
        }),
      )
      .sort(
        (first, second) =>
          Math.abs(
            second.netValueBase,
          ) -
            Math.abs(
              first.netValueBase,
            ) ||
          first.assetClassSortOrder -
            second.assetClassSortOrder ||
          first.assetClassName.localeCompare(
            second.assetClassName,
          ),
      );

  const positiveTotalBase =
    assetClasses
      .filter(
        (item) =>
          item.netValueBase > 0,
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.netValueBase,
        0,
      );

  const negativeTotalBase =
    assetClasses
      .filter(
        (item) =>
          item.netValueBase < 0,
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.netValueBase,
        0,
      );

  return {
    report: {
      reportRunId:
        reportRun.id,

      fromDate:
        reportRun.from_date,

      toDate:
        reportRun.to_date,

      baseCurrency:
        reportRun.base_currency,

      externalContributionsBase:
        Number(
          reportRun.external_contributions_base,
        ),

      boughtBase:
        Number(
          reportRun.bought_base,
        ),

      soldBase:
        Number(
          reportRun.sold_base,
        ),

      netTradingBase,
    },

    instruments,

    assetClasses: {
      items:
        assetClasses,

      positiveTotalBase,

      negativeTotalBase,
    },
  };
}