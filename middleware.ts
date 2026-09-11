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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/login";
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const isWorkerSync =
    request.nextUrl.pathname === "/api/attendance/sync" &&
    Boolean(process.env.ATTENDANCE_WORKER_SECRET) &&
    request.headers.get("x-attendance-worker-secret") ===
      process.env.ATTENDANCE_WORKER_SECRET;
  const isConnectorIngest =
    request.nextUrl.pathname === "/api/attendance/ingest";
  const isConnectorCommand = request.nextUrl.pathname.startsWith(
    "/api/attendance/commands",
  );

  if (
    isApi &&
    !user &&
    !isWorkerSync &&
    !isConnectorIngest &&
    !isConnectorCommand
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
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
      .select("role, employee_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut({ scope: "local" });
      if (isApi)
        return withCookies(
          NextResponse.json(
            { error: "Account profile is not configured." },
            { status: 403 },
          ),
          response,
        );
      return withCookies(
        NextResponse.redirect(new URL("/login?error=profile", request.url)),
        response,
      );
    }

    if (profile?.is_active === false) {
      await supabase.auth.signOut({ scope: "local" });
      return withCookies(
        NextResponse.redirect(new URL("/login?error=inactive", request.url)),
        response,
      );
    }

    if (profile?.role === "employee") {
      const employeeDefaultRoute =
        request.nextUrl.pathname === "/dashboard" ||
        request.nextUrl.pathname === "/dashboard/settings" ||
        request.nextUrl.pathname.startsWith("/dashboard/my-attendance") ||
        request.nextUrl.pathname.startsWith("/dashboard/my-salary") ||
        request.nextUrl.pathname.startsWith("/dashboard/apply-leave") ||
        request.nextUrl.pathname.startsWith("/dashboard/employee") ||
        request.nextUrl.pathname.startsWith("/api/me");
      const module = permissionModule(request.nextUrl.pathname);
      const permission =
        module && profile.employee_id
          ? await supabase
              .from("permissions")
              .select("can_read, can_add, can_edit, can_delete")
              .eq("employee_id", profile.employee_id)
              .eq("module", module)
              .maybeSingle()
          : { data: null };
      const requiredPermission = requiredAction(request);
      const allowed =
        employeeDefaultRoute || permission.data?.[requiredPermission] === true;

      if (!allowed && isApi)
        return NextResponse.json(
          { error: `Permission required: ${module ?? "this module"}.` },
          { status: 403 },
        );
      if (!allowed && isDashboard)
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

function permissionModule(pathname: string) {
  const match = pathname.match(/^\/(?:dashboard|api)\/([^/]+)/);
  const segment = match?.[1];
  const modules: Record<string, string> = {
    devices: "devices",
    employees: "employees",
    attendance: "attendance",
    leaves: "leave",
    salary: "salary",
    salaries: "salary",
    "company-accounts": "company_accounts",
    companies: "company_accounts",
    payments: "payment_tracking",
    lookups: "lookups",
  };
  return segment ? modules[segment] : undefined;
}

function requiredAction(
  request: NextRequest,
): "can_read" | "can_add" | "can_edit" | "can_delete" {
  if (request.method === "POST") return "can_add";
  if (request.method === "PATCH") return "can_edit";
  if (request.method === "DELETE") return "can_delete";
  return "can_read";
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/api/:path*"],
};
