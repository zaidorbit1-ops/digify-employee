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
  const isRoot = request.nextUrl.pathname === "/";
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
  const isCrmLeadIngest =
    request.nextUrl.pathname === "/api/crm/integrations/leads";
  const isCrmTracking = request.nextUrl.pathname.startsWith(
    "/api/crm/tracking/",
  );

  if (
    isApi &&
    !user &&
    !isWorkerSync &&
    !isConnectorIngest &&
    !isConnectorCommand &&
    !isCrmLeadIngest &&
    !isCrmTracking
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (isRoot && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isRoot && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
        request.nextUrl.pathname.startsWith("/dashboard/notes") ||
        request.nextUrl.pathname.startsWith("/dashboard/employee/holidays") ||
        request.nextUrl.pathname.startsWith("/dashboard/employee") ||
        request.nextUrl.pathname.startsWith("/dashboard/internal-chat") ||
        request.nextUrl.pathname.startsWith("/api/me") ||
        request.nextUrl.pathname.startsWith("/api/notes") ||
        request.nextUrl.pathname.startsWith("/api/chat") ||
        /^\/api\/salaries\/[^/]+\/receipt$/.test(request.nextUrl.pathname);
      const employeeManagementModules = [
        "devices",
        "employees",
        "attendance",
        "leave",
        "holidays",
        "salary",
        "company_accounts",
        "payment_tracking",
        "lookups",
      ];
      const hasEmployeeManagementAccess =
        !!profile.employee_id &&
        (await supabase
          .from("permissions")
          .select("module, can_read, can_add, can_edit, can_delete")
          .eq("employee_id", profile.employee_id)
          .in("module", employeeManagementModules)
          .or("can_read.eq.true,can_add.eq.true,can_edit.eq.true,can_delete.eq.true")
          .maybeSingle()).data !== null;
      const crmRoutes = [
        "/dashboard/crm",
        "/dashboard/crm/companies",
        "/dashboard/crm/custom-fields",
        "/dashboard/crm/leads",
        "/dashboard/crm/experts",
        "/dashboard/crm/orders",
        "/dashboard/crm/contacts",
        "/dashboard/crm/segments",
        "/dashboard/crm/webmail",
        "/dashboard/crm/templates",
        "/dashboard/crm/campaigns",
        "/dashboard/crm/automations",
        "/dashboard/crm/analytics",
        "/dashboard/crm/settings",
      ];
      const isCrmRoute = crmRoutes.some((route) =>
        request.nextUrl.pathname === route ||
        request.nextUrl.pathname.startsWith(`${route}/`),
      );
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
      const crmPermissions =
        profile.employee_id && isCrmRoute
          ? await supabase
              .from("permissions")
              .select("module, can_read, can_add, can_edit, can_delete")
              .eq("employee_id", profile.employee_id)
          : { data: [] };
      const requiredPermission = requiredAction(request);
      const hasAnyCrmAccess =
        (crmPermissions.data ?? []).some(
          (row) =>
            [
              "crm_companies",
              "crm_custom_fields",
              "crm_leads",
              "crm_experts",
              "crm_orders",
              "crm_contacts",
              "crm_segments",
              "crm_webmail",
              "crm_email_templates",
              "crm_campaigns",
              "crm_automations",
              "crm_analytics",
              "crm_settings",
            ].includes(row.module) &&
            (row.can_read || row.can_add || row.can_edit || row.can_delete),
        );
      const allowed =
        employeeDefaultRoute ||
        permission.data?.[requiredPermission] === true ||
        (isCrmRoute && hasAnyCrmAccess && requiredPermission === "can_read") ||
        (request.nextUrl.pathname === "/dashboard" && !hasEmployeeManagementAccess && hasAnyCrmAccess);

      if (request.nextUrl.pathname === "/dashboard" && !hasEmployeeManagementAccess && hasAnyCrmAccess) {
        return NextResponse.redirect(new URL("/dashboard/crm/companies", request.url));
      }

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
  if (pathname.startsWith("/dashboard/crm/") || pathname.startsWith("/api/crm/")) {
    const match = pathname.match(/^\/(?:dashboard|api)\/crm\/([^/]+)/);
    const segment = match?.[1];
    const crmModules: Record<string, string> = {
      companies: "crm_companies",
      "custom-fields": "crm_custom_fields",
      leads: "crm_leads",
      experts: "crm_experts",
      orders: "crm_orders",
      contacts: "crm_contacts",
      segments: "crm_segments",
      webmail: "crm_webmail",
      templates: "crm_email_templates",
      campaigns: "crm_campaigns",
      automations: "crm_automations",
      analytics: "crm_analytics",
      settings: "crm_settings",
    };
    return segment ? crmModules[segment] : "crm_overview";
  }

  const match = pathname.match(/^\/(?:dashboard|api)\/([^/]+)/);
  const segment = match?.[1];
  const modules: Record<string, string> = {
    devices: "devices",
    employees: "employees",
    attendance: "attendance",
    leaves: "leave",
    leave: "leave",
    salary: "salary",
    salaries: "salary",
    "company-accounts": "company_accounts",
    companies: "company_accounts",
    payments: "payment_tracking",
    lookups: "lookups",
    holidays: "holidays",
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
  matcher: ["/", "/login", "/dashboard/:path*", "/api/:path*"],
};
