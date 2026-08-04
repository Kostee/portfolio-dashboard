"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isAccountCurrency,
  isAccountType,
} from "./account-options";

export async function createAccount(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const rawName = formData.get("accountName");
  const accountName =
    typeof rawName === "string" ? rawName.trim() : "";

  const rawOwnerId = formData.get("ownerId");
  const ownerId =
    typeof rawOwnerId === "string" ? rawOwnerId : "";

  const rawProviderId = formData.get("providerId");
  const providerId =
    typeof rawProviderId === "string" ? rawProviderId : "";

  const rawAccountType = formData.get("accountType");
  const accountType =
    typeof rawAccountType === "string"
      ? rawAccountType
      : "";

  const rawBaseCurrency = formData.get("baseCurrency");
  const baseCurrency =
    typeof rawBaseCurrency === "string"
      ? rawBaseCurrency.toUpperCase()
      : "";

  if (!accountName) {
    redirect("/portfolio/accounts?error=name_required");
  }

  if (!ownerId) {
    redirect("/portfolio/accounts?error=owner_required");
  }

  if (!providerId) {
    redirect("/portfolio/accounts?error=provider_required");
  }

  if (!isAccountType(accountType)) {
    redirect("/portfolio/accounts?error=type_required");
  }

  if (!isAccountCurrency(baseCurrency)) {
    redirect("/portfolio/accounts?error=currency_required");
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
      "/portfolio/accounts?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect("/portfolio/accounts?error=forbidden");
  }

  const { data: owner, error: ownerError } = await supabase
    .from("owners")
    .select("id")
    .eq("workspace_id", membership.workspace_id)
    .eq("id", ownerId)
    .eq("is_active", true)
    .maybeSingle();

  if (ownerError || !owner) {
    console.error("Owner validation failed:", ownerError);

    redirect("/portfolio/accounts?error=invalid_owner");
  }

  const { data: provider, error: providerError } =
    await supabase
      .from("providers")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", providerId)
      .eq("is_active", true)
      .maybeSingle();

  if (providerError || !provider) {
    console.error(
      "Provider validation failed:",
      providerError,
    );

    redirect("/portfolio/accounts?error=invalid_provider");
  }

  const { error } = await supabase.from("accounts").insert({
    workspace_id: membership.workspace_id,
    owner_id: ownerId,
    provider_id: providerId,
    name: accountName,
    account_type: accountType,
    base_currency: baseCurrency,
  });

  if (error) {
    console.error("Account creation failed:", error);

    if (error.code === "23505") {
      redirect("/portfolio/accounts?error=duplicate_account");
    }

    redirect("/portfolio/accounts?error=creation_failed");
  }

  revalidatePath("/portfolio/accounts");
  revalidatePath("/portfolio");

  redirect("/portfolio/accounts?success=account_added");
}