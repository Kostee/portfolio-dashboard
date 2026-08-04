"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/portfolio";
  }

  return value;
}

export async function login(formData: FormData) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const nextPath = getSafeNextPath(formData.get("next"));

  if (
    typeof emailValue !== "string" ||
    typeof passwordValue !== "string" ||
    !emailValue.trim() ||
    !passwordValue
  ) {
    redirect(
      `/portfolio/login?error=${encodeURIComponent(
        "Enter your email address and password.",
      )}`,
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: emailValue.trim(),
    password: passwordValue,
  });

  if (error) {
    redirect(
      `/portfolio/login?error=${encodeURIComponent(
        "Invalid email address or password.",
      )}`,
    );
  }

  redirect(nextPath);
}