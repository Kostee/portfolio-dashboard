
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { isProviderType } from "./provider-types";

export async function createProvider(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const rawName = formData.get("providerName");
  const providerName =
    typeof rawName === "string" ? rawName.trim() : "";

  const rawProviderType = formData.get("providerType");
  const providerType =
    typeof rawProviderType === "string" ? rawProviderType : "";

  if (!providerName) {
    redirect("/portfolio/providers?error=name_required");
  }

  if (!isProviderType(providerType)) {
    redirect("/portfolio/providers?error=type_required");
  }

  const { data: membership, error: membershipError } = await supabase
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

    redirect("/portfolio/providers?error=workspace_not_found");
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect("/portfolio/providers?error=forbidden");
  }

  const { error } = await supabase.from("providers").insert({
    workspace_id: membership.workspace_id,
    name: providerName,
    provider_type: providerType,
  });

  if (error) {
    console.error("Provider creation failed:", error);

    if (error.code === "23505") {
      redirect("/portfolio/providers?error=duplicate_name");
    }

    redirect("/portfolio/providers?error=creation_failed");
  }

  revalidatePath("/portfolio/providers");
  redirect("/portfolio/providers?success=provider_added");
}