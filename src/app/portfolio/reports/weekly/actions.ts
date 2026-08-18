"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  fetchNbpTableARate,
} from "@/lib/finance/nbp-table-a";

import type {
  NbpTableARate,
} from "@/lib/finance/nbp-table-a";

import {
  isValidIsoDate,
  readText,
} from "@/app/portfolio/operations/form-helpers";

const WEEKLY_REPORT_PATH =
  "/portfolio/reports/weekly";

const FALLBACK_ASSET_COLOR =
  "#64748b";

type MutableInstrumentItem = {
  instrumentId: string;
  instrumentName: string;
  instrumentTicker: string | null;

  assetClassId: string | null;
  assetClassName: string;
  assetClassCode: string | null;
  assetClassColor: string;
  assetClassSortOrder: number;

  buyQuantity: number;
  sellQuantity: number;

  boughtBase: number;
  soldBase: number;

  operationIds: Set<string>;
};

function redirectWithError(
  error: string,
  fromDate?: string,
  toDate?: string,
): never {
  const params =
    new URLSearchParams({
      error,
    });

  if (fromDate) {
    params.set(
      "from",
      fromDate,
    );
  }

  if (toDate) {
    params.set(
      "to",
      toDate,
    );
  }

  redirect(
    `${WEEKLY_REPORT_PATH}?${params.toString()}`,
  );
}

export async function generateWeeklyOperationReport(
  formData: FormData,
): Promise<void> {
  const fromDate =
    readText(
      formData,
      "fromDate",
    );

  const toDate =
    readText(
      formData,
      "toDate",
    );

  if (
    !isValidIsoDate(
      fromDate,
    )
  ) {
    redirectWithError(
      "from_date_invalid",
    );
  }

  if (
    !isValidIsoDate(
      toDate,
    )
  ) {
    redirectWithError(
      "to_date_invalid",
      fromDate,
    );
  }

  if (fromDate > toDate) {
    redirectWithError(
      "date_range_invalid",
      fromDate,
      toDate,
    );
  }

  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect(
      "/portfolio/login",
    );
  }

  const {
    data: membership,
    error: membershipError,
  } =
    await supabase
      .from("workspace_members")
      .select(
        "workspace_id, role",
      )
      .order(
        "created_at",
        {
          ascending: true,
        },
      )
      .limit(1)
      .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Weekly report membership query failed:",
      membershipError,
    );

    redirectWithError(
      "workspace_unavailable",
      fromDate,
      toDate,
    );
  }

  if (
    membership.role !==
      "admin" &&
    membership.role !==
      "editor"
  ) {
    redirectWithError(
      "permission_denied",
      fromDate,
      toDate,
    );
  }

  const {
    data: workspace,
    error: workspaceError,
  } =
    await supabase
      .from("workspaces")
      .select(
        "base_currency",
      )
      .eq(
        "id",
        membership.workspace_id,
      )
      .single();

  if (
    workspaceError ||
    !workspace
  ) {
    console.error(
      "Weekly report workspace query failed:",
      workspaceError,
    );

    redirectWithError(
      "workspace_unavailable",
      fromDate,
      toDate,
    );
  }

  /*
   * NBP table A is our PLN-base fallback.
   * The current workspace is PLN-based.
   */
  if (
    workspace.base_currency !==
    "PLN"
  ) {
    redirectWithError(
      "unsupported_base_currency",
      fromDate,
      toDate,
    );
  }

  const {
    data: legs,
    error: legsError,
  } =
    await supabase
      .from(
        "portfolio_operation_legs",
      )
      .select(
        "operation_id, operation_date, operation_type, status, component, instrument_id, instrument_name, instrument_ticker, quantity_delta, value_delta, currency, base_value_delta",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .gte(
        "operation_date",
        fromDate,
      )
      .lte(
        "operation_date",
        toDate,
      )
      .eq(
        "status",
        "posted",
      )
      .eq(
        "component",
        "principal",
      )
      .in(
        "operation_type",
        [
          "buy",
          "sell",
        ],
      );

  if (legsError) {
    console.error(
      "Weekly report operation query failed:",
      legsError,
    );

    redirectWithError(
      "operations_unavailable",
      fromDate,
      toDate,
    );
  }

  const usableLegs =
    (legs ?? []).filter(
      (leg) =>
        leg.operation_id &&
        leg.operation_date &&
        leg.instrument_id &&
        leg.operation_type &&
        (
          leg.operation_type ===
            "buy" ||
          leg.operation_type ===
            "sell"
        ),
    );

  const instrumentIds =
    Array.from(
      new Set(
        usableLegs.map(
          (leg) =>
            leg.instrument_id as string,
        ),
      ),
    );

  const {
    data: instruments,
    error: instrumentsError,
  } =
    instrumentIds.length > 0
      ? await supabase
          .from("instruments")
          .select(
            "id, name, ticker, asset_class_id",
          )
          .eq(
            "workspace_id",
            membership.workspace_id,
          )
          .in(
            "id",
            instrumentIds,
          )
      : {
          data: [],
          error: null,
        };

  if (instrumentsError) {
    console.error(
      "Weekly report instruments query failed:",
      instrumentsError,
    );

    redirectWithError(
      "instruments_unavailable",
      fromDate,
      toDate,
    );
  }

  const assetClassIds =
    Array.from(
      new Set(
        (instruments ?? [])
          .map(
            (instrument) =>
              instrument.asset_class_id,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),
      ),
    );

  const {
    data: assetClasses,
    error: assetClassesError,
  } =
    assetClassIds.length > 0
      ? await supabase
          .from(
            "asset_classes",
          )
          .select(
            "id, name, code, color_hex, sort_order",
          )
          .eq(
            "workspace_id",
            membership.workspace_id,
          )
          .in(
            "id",
            assetClassIds,
          )
      : {
          data: [],
          error: null,
        };

  if (assetClassesError) {
    console.error(
      "Weekly report asset-class query failed:",
      assetClassesError,
    );

    redirectWithError(
      "asset_classes_unavailable",
      fromDate,
      toDate,
    );
  }

  const instrumentMap =
    new Map(
      (instruments ?? []).map(
        (instrument) => [
          instrument.id,
          instrument,
        ],
      ),
    );

  const assetClassMap =
    new Map(
      (assetClasses ?? []).map(
        (assetClass) => [
          assetClass.id,
          assetClass,
        ],
      ),
    );

  const fxCache =
    new Map<
      string,
      NbpTableARate
    >();

  const grouped =
    new Map<
      string,
      MutableInstrumentItem
    >();

  try {
    for (
      const leg of usableLegs
    ) {
      const instrumentId =
        leg.instrument_id as string;

      const operationId =
        leg.operation_id as string;

      const operationDate =
        leg.operation_date as string;

      const instrument =
        instrumentMap.get(
          instrumentId,
        );

      const assetClass =
        instrument?.asset_class_id
          ? assetClassMap.get(
              instrument.asset_class_id,
            )
          : null;

      const quantity =
        Math.abs(
          Number(
            leg.quantity_delta ??
              0,
          ),
        );

      const nativeValue =
        Math.abs(
          Number(
            leg.value_delta ??
              0,
          ),
        );

      let baseValue =
        leg.base_value_delta ===
        null
          ? null
          : Math.abs(
              Number(
                leg.base_value_delta,
              ),
            );

      if (
        baseValue === null
      ) {
        if (
          leg.currency ===
          "PLN"
        ) {
          baseValue =
            nativeValue;
        } else {
          if (!leg.currency) {
            throw new Error(
              `Operation ${operationId} has no currency.`,
            );
          }

          const cacheKey =
            `${leg.currency}|${operationDate}`;

          let fx =
            fxCache.get(
              cacheKey,
            );

          if (!fx) {
            fx =
              await fetchNbpTableARate(
                leg.currency,
                operationDate,
              );

            fxCache.set(
              cacheKey,
              fx,
            );
          }

          baseValue =
            nativeValue *
            fx.rateToBase;
        }
      }

      if (
        !Number.isFinite(
          baseValue,
        ) ||
        baseValue < 0
      ) {
        throw new Error(
          `Operation ${operationId} has no valid base value.`,
        );
      }

      let item =
        grouped.get(
          instrumentId,
        );

      if (!item) {
        item = {
          instrumentId,

          instrumentName:
            instrument?.name ??
            leg.instrument_name ??
            "Unknown instrument",

          instrumentTicker:
            instrument?.ticker ??
            leg.instrument_ticker ??
            null,

          assetClassId:
            assetClass?.id ??
            null,

          assetClassName:
            assetClass?.name ??
            "Unclassified",

          assetClassCode:
            assetClass?.code ??
            null,

          assetClassColor:
            assetClass?.color_hex ??
            FALLBACK_ASSET_COLOR,

          assetClassSortOrder:
            assetClass?.sort_order ??
            999,

          buyQuantity: 0,
          sellQuantity: 0,

          boughtBase: 0,
          soldBase: 0,

          operationIds:
            new Set<string>(),
        };

        grouped.set(
          instrumentId,
          item,
        );
      }

      item.operationIds.add(
        operationId,
      );

      if (
        leg.operation_type ===
        "buy"
      ) {
        item.buyQuantity +=
          quantity;

        item.boughtBase +=
          baseValue;
      } else {
        item.sellQuantity +=
          quantity;

        item.soldBase +=
          baseValue;
      }
    }
  } catch (error) {
    console.error(
      "Weekly report value normalization failed:",
      error,
    );

    redirectWithError(
      "fx_rate_unavailable",
      fromDate,
      toDate,
    );
  }

  const items =
    Array.from(
      grouped.values(),
    )
      /*
       * One instrument = one NET item.
       * We retain instruments whose value net is
       * effectively zero for auditability.
       */
      .map(
        (item) => ({
          instrument_id:
            item.instrumentId,

          instrument_name:
            item.instrumentName,

          instrument_ticker:
            item.instrumentTicker,

          asset_class_id:
            item.assetClassId,

          asset_class_name:
            item.assetClassName,

          asset_class_code:
            item.assetClassCode,

          asset_class_color:
            item.assetClassColor,

          asset_class_sort_order:
            item.assetClassSortOrder,

          buy_quantity:
            item.buyQuantity,

          sell_quantity:
            item.sellQuantity,

          net_quantity:
            item.buyQuantity -
            item.sellQuantity,

          bought_base:
            item.boughtBase,

          sold_base:
            item.soldBase,

          net_value_base:
            item.boughtBase -
            item.soldBase,

          operation_count:
            item.operationIds.size,

          operation_ids:
            Array.from(
              item.operationIds,
            ),
        }),
      );

  const boughtBase =
    items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.bought_base,
      0,
    );

  const soldBase =
    items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.sold_base,
      0,
    );

  const {
    data: existingRun,
    error: existingRunError,
  } =
    await supabase
      .from(
        "portfolio_weekly_report_runs",
      )
      .select(
        "id",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "from_date",
        fromDate,
      )
      .eq(
        "to_date",
        toDate,
      )
      .maybeSingle();

  if (existingRunError) {
    console.error(
      "Existing weekly report query failed:",
      existingRunError,
    );

    redirectWithError(
      "report_lookup_failed",
      fromDate,
      toDate,
    );
  }

  const {
    data: reportRunId,
    error: reportError,
  } =
    await supabase.rpc(
      "replace_weekly_operation_report",
      {
        p_workspace_id:
          membership.workspace_id,

        p_from_date:
          fromDate,

        p_to_date:
          toDate,

        p_bought_base:
          boughtBase,

        p_sold_base:
          soldBase,

        p_fx_rates:
          Array.from(
            fxCache.values(),
          ),

        p_items:
          items,
      },
    );

  if (
    reportError ||
    !reportRunId
  ) {
    console.error(
      "Weekly report creation failed:",
      reportError,
    );

    redirectWithError(
      "report_creation_failed",
      fromDate,
      toDate,
    );
  }

  revalidatePath(
    WEEKLY_REPORT_PATH,
  );

  const resultParams =
    new URLSearchParams({
      success:
        existingRun
          ? "replaced"
          : "created",

      report:
        reportRunId,

      from:
        fromDate,

      to:
        toDate,
    });

  redirect(
    `${WEEKLY_REPORT_PATH}?${resultParams.toString()}`,
  );
}
