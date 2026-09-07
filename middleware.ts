import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/login";
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (isApi && !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (isDashboard && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLogin && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && (isDashboard || isApi)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=inactive", request.url));
    }

    if (profile?.role === "employee" && isApi) {
      return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });
    }

    if (profile?.role === "employee" && isDashboard && request.nextUrl.pathname !== "/dashboard") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/api/:path*"],
};
