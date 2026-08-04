"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const rawName = formData.get("workspaceName");
  const workspaceName =
    typeof rawName === "string" ? rawName.trim() : "";

  if (!workspaceName) {
    redirect("/portfolio?workspace_error=name_required");
  }

  const { error } = await supabase.rpc("create_workspace", {
    p_name: workspaceName,
    p_base_currency: "PLN",
    p_timezone: "Europe/Warsaw",
  });

  if (error) {
    console.error("Workspace creation failed:", error);
    redirect("/portfolio?workspace_error=creation_failed");
  }

  redirect("/portfolio");
}