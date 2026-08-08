"use server";

import {
  revalidatePath,
} from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  isValidIsoDate,
} from "../../../operations/form-helpers";

const MARKET_DATA_PATH =
  "/portfolio/reports/monthly/market-data";

function buildPath(
  asOfDate: string,
  parameterName:
    | "error"
    | "success",
  parameterValue: string,
): string {
  const searchParams =
    new URLSearchParams({
      asOf: asOfDate,
      [parameterName]:
        parameterValue,
    });

  return `${MARKET_DATA_PATH}?${searchParams.toString()}`;
}

export async function applyAutomaticMonthlyMarketProposals(
  formData: FormData,
) {
  const rawAsOfDate =
    formData.get("asOfDate");

  const asOfDate =
    typeof rawAsOfDate ===
      "string"
      ? rawAsOfDate
      : "";

  if (
    !isValidIsoDate(asOfDate)
  ) {
    redirect(
      buildPath(
        asOfDate,
        "error",
        "date_invalid",
      ),
    );
  }

  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  if (
    !claimsData?.claims
  ) {
    redirect(
      "/portfolio/login",
    );
  }

  const {
    data: membership,
    error:
      membershipError,
  } = await supabase
    .from(
      "workspace_members",
    )
    .select(
      "workspace_id, role",
    )
    .order(
      "created_at",
      { ascending: true },
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      buildPath(
        asOfDate,
        "error",
        "workspace_not_found",
      ),
    );
  }

  if (
    membership.role !==
      "admin" &&
    membership.role !==
      "editor"
  ) {
    redirect(
      buildPath(
        asOfDate,
        "error",
        "forbidden",
      ),
    );
  }

  const {
    data: appliedCount,
    error,
  } = await supabase.rpc(
    "apply_monthly_market_proposals",
    {
      p_workspace_id:
        membership.workspace_id,
      p_as_of_date:
        asOfDate,
    },
  );

  if (error) {
    console.error(
      "Automatic market proposal apply failed:",
      error,
    );

    redirect(
      buildPath(
        asOfDate,
        "error",
        "apply_failed",
      ),
    );
  }

  revalidatePath(
    MARKET_DATA_PATH,
  );

  revalidatePath(
    "/portfolio/reports/monthly",
  );

  revalidatePath(
    "/portfolio/state",
  );

  revalidatePath(
    "/portfolio/valuations",
  );

  redirect(
    buildPath(
      asOfDate,
      "success",
      `applied_${Number(
        appliedCount ?? 0,
      )}`,
    ),
  );
}
