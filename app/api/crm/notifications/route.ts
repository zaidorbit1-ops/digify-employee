import { withCrmApiLogging } from "@/lib/crm-logs";
import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

function isMissingCompanyScopeColumn(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const databaseError = error as { code?: string; message?: string; details?: string };
  const message = `${databaseError.message ?? ""} ${databaseError.details ?? ""}`.toLowerCase();
  return (databaseError.code === "42703" || databaseError.code === "PGRST204") && message.includes("company_id");
}

async function getNotificationContext() {
  const client = await getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { client, user: null, profile: null, status: 401 };

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (profile?.is_active === false || (profile?.role !== "superadmin" && profile?.role !== "employee")) {
    return { client, user: null, profile: null, status: 403 };
  }
  if (profile.role === "employee" && !profile.employee_id) return { client, user: null, profile: null, status: 403 };
  return { client, user, profile, status: 200 };
}

async function getEmployeeScopes(employeeId: number) {
  const client = getSupabaseServiceRoleClient();
  const modules = ["crm_leads", "crm_webmail"];
  const { data: permissions, error: permissionsError } = await client
    .from("permissions")
    .select("module")
    .eq("employee_id", employeeId)
    .in("module", modules)
    .eq("can_read", true);
  if (permissionsError) throw permissionsError;
  const readableModules = Array.from(new Set((permissions ?? []).map((permission) => permission.module)));
  if (!readableModules.length) return [];

  const { data: grants, error: grantsError } = await client
    .from("employee_crm_module_company_access")
    .select("module, company_id")
    .eq("employee_id", employeeId)
    .in("module", readableModules);
  if (grantsError) throw grantsError;

  return modules.flatMap((module) => {
    const companyIds = Array.from(new Set((grants ?? [])
      .filter((grant) => grant.module === module)
      .map((grant) => grant.company_id)));
    return companyIds.length ? [{ module, companyIds }] : [];
  });
}

export async function GET(request: Request) {
  try {
    const { client, user, profile, status } = await getNotificationContext();
    if (!user || !profile) return NextResponse.json({ error: "CRM notification access required." }, { status });
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get("page") || 1);
    const requestedLimit = Number(params.get("limit") || 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 10;
    const typeFilter = params.get("type");
    const readFilter = params.get("read");
    const supportedType = typeFilter === "crm_lead" || typeFilter === "crm_email" ? typeFilter : null;
    const supportedRead = readFilter === "read" || readFilter === "unread" ? readFilter : null;
    const employeeScopes = profile.role === "employee"
      ? await getEmployeeScopes(Number(profile.employee_id))
      : [];
    const scopeFilters = employeeScopes.map((scope) => {
      const notificationType = scope.module === "crm_leads" ? "crm_lead" : "crm_email";
      return `and(type.eq.${notificationType},company_id.in.(${scope.companyIds.join(",")}))`;
    });
    if (profile.role === "employee" && !scopeFilters.length) {
      return NextResponse.json({ notifications: [], unreadCount: 0, page, totalCount: 0, hasMore: false, enabled: false });
    }
    const scopeFilter = profile.role === "employee" ? scopeFilters.join(",") : null;
    let historyQuery = client
      .from("notifications")
      .select("id, recipient_id, type, message, is_read, related_record_id, related_url, created_at", { count: "exact" })
      .eq("recipient_id", user.id)
      .in("type", ["crm_lead", "crm_email"]);
    let unreadQuery = client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .in("type", ["crm_lead", "crm_email"])
      .eq("is_read", false);
    if (scopeFilter) {
      historyQuery = historyQuery.or(scopeFilter);
      unreadQuery = unreadQuery.or(scopeFilter);
    }
    if (supportedType) historyQuery = historyQuery.eq("type", supportedType);
    if (supportedRead) historyQuery = historyQuery.eq("is_read", supportedRead === "read");
    const [notificationsResult, unreadResult] = await Promise.all([
      historyQuery
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
      unreadQuery,
    ]);
    if (notificationsResult.error) throw notificationsResult.error;
    if (unreadResult.error) throw unreadResult.error;
    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
      page,
      totalCount: notificationsResult.count ?? 0,
      hasMore: page * limit < (notificationsResult.count ?? 0),
      enabled: true,
    });
  } catch (error) {
    if (isMissingCompanyScopeColumn(error)) {
      return NextResponse.json({ error: "Apply migration 20260930190000_employee_crm_notifications.sql to enable company-scoped CRM notifications." }, { status: 500 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load CRM notifications." }, { status: 500 });
  }
}

export const PATCH = withCrmApiLogging(async function PATCH(request: Request) {
  try {
    const { client, user, profile, status } = await getNotificationContext();
    if (!user || !profile) return NextResponse.json({ error: "CRM notification access required." }, { status });
    const body = await request.json() as { id?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid notification is required." }, { status: 400 });
    if (profile.role === "employee") {
      const { data: notification, error: notificationError } = await client
        .from("notifications")
        .select("id, type, company_id")
        .eq("id", id)
        .eq("recipient_id", user.id)
        .maybeSingle();
      if (notificationError) throw notificationError;
      const scopes = await getEmployeeScopes(Number(profile.employee_id));
      const requiredModule = notification?.type === "crm_lead" ? "crm_leads" : notification?.type === "crm_email" ? "crm_webmail" : null;
      const allowed = notification && requiredModule && scopes.some((scope) =>
        scope.module === requiredModule && scope.companyIds.includes(Number(notification.company_id)));
      if (!allowed) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
    const { error } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("recipient_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update notification." }, { status: 500 });
  }
});