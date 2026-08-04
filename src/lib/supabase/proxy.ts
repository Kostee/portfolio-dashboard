import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  const pathname = request.nextUrl.pathname;

  const isPortfolioRoute = pathname.startsWith("/portfolio");
  const isLoginRoute = pathname === "/portfolio/login";

  if (isPortfolioRoute && !isLoginRoute && !data?.claims) {
    const loginUrl = request.nextUrl.clone();

    loginUrl.pathname = "/portfolio/login";
    loginUrl.searchParams.set("next", pathname);

    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}