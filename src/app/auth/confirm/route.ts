import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "invite",
  "recovery",
  "email_change",
]);

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/portfolio";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const tokenHash = requestUrl.searchParams.get("token_hash");
  const typeValue = requestUrl.searchParams.get("type");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (
    tokenHash &&
    typeValue &&
    allowedOtpTypes.has(typeValue as EmailOtpType)
  ) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeValue as EmailOtpType,
    });

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  const loginUrl = new URL("/portfolio/login", requestUrl.origin);

  loginUrl.searchParams.set(
    "error",
    "The authentication link is invalid or has expired.",
  );

  return NextResponse.redirect(loginUrl);
}