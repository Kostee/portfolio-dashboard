"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  readText,
} from "../../operations/form-helpers";

const CONTRIBUTIONS_PATH =
  "/portfolio/reports/contributions";

function redirectWithResult(
  type: "error" | "success",
  code: string,
): never {
  const searchParams =
    new URLSearchParams({
      [type]: code,
    });

  redirect(
    `${CONTRIBUTIONS_PATH}?${searchParams.toString()}`,
  );
}

export async function saveContributionBaseline(
  formData: FormData,
) {
  const supabase =
    await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .order("created_at", {
      ascending: true,
    })
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

    redirectWithResult(
      "error",
      "workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirectWithResult(
      "error",
      "forbidden",
    );
  }

  const baselineDate =
    readText(
      formData,
      "baselineDate",
    );

  const rawValue =
    readText(
      formData,
      "cumulativeContributionsBase",
    ).replace(",", ".");

  const notes =
    readText(
      formData,
      "notes",
    );

  if (!isValidIsoDate(baselineDate)) {
    redirectWithResult(
      "error",
      "date_invalid",
    );
  }

  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(
      rawValue,
    )
  ) {
    redirectWithResult(
      "error",
      "value_invalid",
    );
  }

  const value = Number(rawValue);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    redirectWithResult(
      "error",
      "value_invalid",
    );
  }

  const { error } =
    await supabase.rpc(
      "upsert_contribution_baseline",
      {
        p_workspace_id:
          membership.workspace_id,

        p_baseline_date:
          baselineDate,

        p_cumulative_contributions_base:
          value,

        p_notes:
          notes || undefined,
      },
    );

  if (error) {
    console.error(
      "Contribution baseline save failed:",
      error,
    );

    redirectWithResult(
      "error",
      "save_failed",
    );
  }

  revalidatePath(
    CONTRIBUTIONS_PATH,
  );

  revalidatePath(
    "/portfolio/reports/monthly",
  );

  redirectWithResult(
    "success",
    "saved",
  );
}