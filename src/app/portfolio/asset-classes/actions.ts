"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { DEFAULT_ASSET_CLASSES } from "./default-asset-classes";

export async function seedDefaultAssetClasses(
  formData: FormData,
) {
  void formData;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirect(
      "/portfolio/asset-classes?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect("/portfolio/asset-classes?error=forbidden");
  }

  const { count, error: countError } = await supabase
    .from("asset_classes")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("workspace_id", membership.workspace_id);

  if (countError) {
    console.error(
      "Asset class count query failed:",
      countError,
    );

    redirect(
      "/portfolio/asset-classes?error=creation_failed",
    );
  }

  if ((count ?? 0) > 0) {
    redirect(
      "/portfolio/asset-classes?error=already_initialized",
    );
  }

  const rows = DEFAULT_ASSET_CLASSES.map((assetClass) => ({
    workspace_id: membership.workspace_id,
    code: assetClass.code,
    name: assetClass.name,
    color_hex: assetClass.colorHex,
    sort_order: assetClass.sortOrder,
    include_in_allocation_chart:
      assetClass.includeInAllocationChart,
    include_in_xirr: assetClass.includeInXirr,
  }));

  const { error } = await supabase
    .from("asset_classes")
    .insert(rows);

  if (error) {
    console.error(
      "Default asset class creation failed:",
      error,
    );

    redirect(
      "/portfolio/asset-classes?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/asset-classes");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/asset-classes?success=defaults_added",
  );
}