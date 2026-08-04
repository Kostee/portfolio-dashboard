"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createOwner(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const rawDisplayName = formData.get("displayName");
  const displayName =
    typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";

  if (!displayName) {
    redirect("/portfolio/owners?error=name_required");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error("Workspace membership query failed:", membershipError);
    redirect("/portfolio/owners?error=workspace_not_found");
  }

  if (membership.role !== "admin" && membership.role !== "editor") {
    redirect("/portfolio/owners?error=forbidden");
  }

  const { data: lastOwner, error: orderError } = await supabase
    .from("owners")
    .select("sort_order")
    .eq("workspace_id", membership.workspace_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) {
    console.error("Owner order query failed:", orderError);
    redirect("/portfolio/owners?error=creation_failed");
  }

  const nextSortOrder = (lastOwner?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("owners").insert({
    workspace_id: membership.workspace_id,
    display_name: displayName,
    sort_order: nextSortOrder,
  });

  if (error) {
    console.error("Owner creation failed:", error);

    if (error.code === "23505") {
      redirect("/portfolio/owners?error=duplicate_name");
    }

    redirect("/portfolio/owners?error=creation_failed");
  }

  revalidatePath("/portfolio/owners");
  redirect("/portfolio/owners?success=owner_added");
}