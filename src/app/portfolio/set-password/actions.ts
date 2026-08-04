"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export async function setPassword(formData: FormData) {
  const passwordValue = formData.get("password");
  const confirmationValue = formData.get("passwordConfirmation");

  if (
    typeof passwordValue !== "string" ||
    typeof confirmationValue !== "string"
  ) {
    redirect(
      `/portfolio/set-password?error=${encodeURIComponent(
        "Enter and confirm your new password.",
      )}`,
    );
  }

  if (passwordValue !== confirmationValue) {
    redirect(
      `/portfolio/set-password?error=${encodeURIComponent(
        "The passwords do not match.",
      )}`,
    );
  }

  if (!passwordPattern.test(passwordValue)) {
    redirect(
      `/portfolio/set-password?error=${encodeURIComponent(
        "Use at least 12 characters, including an uppercase letter, a lowercase letter and a digit.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect(
      `/portfolio/login?error=${encodeURIComponent(
        "Your authentication session has expired.",
      )}`,
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: passwordValue,
  });

  if (error) {
    redirect(
      `/portfolio/set-password?error=${encodeURIComponent(
        "The password could not be updated. Please try again.",
      )}`,
    );
  }

  redirect("/portfolio");
}