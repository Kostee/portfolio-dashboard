
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isInstrumentCurrency,
  isInstrumentKind,
  isTrackingMode,
} from "./instrument-options";

function readText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value.trim() : "";
}

export async function createInstrument(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const name = readText(formData, "instrumentName");
  const ticker = readText(formData, "ticker").toUpperCase();
  const exchange = readText(formData, "exchange").toUpperCase();
  const isin = readText(formData, "isin").toUpperCase();
  const assetClassId = readText(formData, "assetClassId");
  const instrumentKind = readText(
    formData,
    "instrumentKind",
  );
  const trackingMode = readText(formData, "trackingMode");
  const defaultCurrency = readText(
    formData,
    "defaultCurrency",
  ).toUpperCase();

  if (!name) {
    redirect("/portfolio/instruments?error=name_required");
  }

  if (!assetClassId) {
    redirect(
      "/portfolio/instruments?error=asset_class_required",
    );
  }

  if (!isInstrumentKind(instrumentKind)) {
    redirect("/portfolio/instruments?error=kind_required");
  }

  if (!isTrackingMode(trackingMode)) {
    redirect(
      "/portfolio/instruments?error=tracking_mode_required",
    );
  }

  if (!isInstrumentCurrency(defaultCurrency)) {
    redirect(
      "/portfolio/instruments?error=currency_required",
    );
  }

  if (
    isin &&
    !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)
  ) {
    redirect("/portfolio/instruments?error=invalid_isin");
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
      "/portfolio/instruments?error=workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirect("/portfolio/instruments?error=forbidden");
  }

  const { data: assetClass, error: assetClassError } =
    await supabase
      .from("asset_classes")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", assetClassId)
      .eq("is_active", true)
      .maybeSingle();

  if (assetClassError || !assetClass) {
    console.error(
      "Asset class validation failed:",
      assetClassError,
    );

    redirect(
      "/portfolio/instruments?error=invalid_asset_class",
    );
  }

  const { error } = await supabase
    .from("instruments")
    .insert({
      workspace_id: membership.workspace_id,
      name,
      ticker: ticker || null,
      exchange: exchange || null,
      isin: isin || null,
      asset_class_id: assetClassId,
      instrument_kind: instrumentKind,
      tracking_mode: trackingMode,
      default_currency: defaultCurrency,
    });

  if (error) {
    console.error("Instrument creation failed:", error);

    if (error.code === "23505") {
      redirect(
        "/portfolio/instruments?error=duplicate_instrument",
      );
    }

    if (error.code === "23514") {
      redirect("/portfolio/instruments?error=invalid_data");
    }

    redirect(
      "/portfolio/instruments?error=creation_failed",
    );
  }

  revalidatePath("/portfolio/instruments");
  revalidatePath("/portfolio");

  redirect(
    "/portfolio/instruments?success=instrument_added",
  );
}