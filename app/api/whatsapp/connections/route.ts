import { NextResponse } from "next/server";
import {
  connectCompany,
  deleteCompanyConnection,
  disconnectCompany,
  getAllConnections,
  resetCompanySession,
  updateCompanyConnection,
} from "@/lib/whatsapp-service";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type PermissionAction = "can_read" | "can_add" | "can_edit" | "can_delete";

async function getRequestContext() {
  const client = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) return { error: "Authentication required." as const };

  const admin = getSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.is_active === false) return { error: "Account access is not available." as const };

  return { admin, profile, error: null };
}

async function hasCompanyPermission(
  context: Exclude<Awaited<ReturnType<typeof getRequestContext>>, { error: string }>,
  companyId: number,
  action: PermissionAction,
) {
  if (context.profile.role === "superadmin") return true;
  if (context.profile.role !== "employee" || !context.profile.employee_id) return false;

  const { data: permission, error: permissionError } = await context.admin
    .from("permissions")
    .select("can_read, can_add, can_edit, can_delete")
    .eq("employee_id", context.profile.employee_id)
    .eq("module", "crm_whatsapp")
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission?.[action]) return false;

  const { data: access, error: accessError } = await context.admin
    .from("employee_crm_module_company_access")
    .select("company_id")
    .eq("employee_id", context.profile.employee_id)
    .eq("module", "crm_whatsapp")
    .eq("company_id", companyId)
    .maybeSingle();
  if (accessError) throw accessError;
  return Boolean(access);
}

async function readPayload(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function errorResponse(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const context = await getRequestContext();
    if (context.error) return NextResponse.json({ error: context.error }, { status: 403 });

    let companyIds: number[] | undefined;
    if (context.profile.role !== "superadmin") {
      if (context.profile.role !== "employee" || !context.profile.employee_id) {
        return NextResponse.json({ error: "Business CRM access required." }, { status: 403 });
      }
      const { data: permission, error: permissionError } = await context.admin
        .from("permissions")
        .select("can_read")
        .eq("employee_id", context.profile.employee_id)
        .eq("module", "crm_whatsapp")
        .maybeSingle();
      if (permissionError) throw permissionError;
      if (!permission?.can_read) {
        return NextResponse.json({ error: "WhatsApp read permission is required." }, { status: 403 });
      }
      const { data: access, error: accessError } = await context.admin
        .from("employee_crm_module_company_access")
        .select("company_id")
        .eq("employee_id", context.profile.employee_id)
        .eq("module", "crm_whatsapp");
      if (accessError) throw accessError;
      companyIds = (access ?? []).map((item) => item.company_id);
    }

    const connections = await getAllConnections(companyIds);
    return NextResponse.json({ connections });
  } catch (error) {
    return errorResponse(error, "Could not load WhatsApp connections.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext();
    if (context.error) return NextResponse.json({ error: context.error }, { status: 403 });
    const payload = await readPayload(request);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }

    const companyId = Number(payload.company_id);
    const action = payload.action;
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "A valid company id is required." }, { status: 400 });
    }

    if (action === "reset") {
      if (!(await hasCompanyPermission(context, companyId, "can_edit"))) {
        return NextResponse.json({ error: "You do not have permission to request a fresh WhatsApp QR for this company." }, { status: 403 });
      }

      const { data: company, error: companyError } = await context.admin
        .from("crm_companies")
        .select("id, name")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) return NextResponse.json({ error: "CRM company not found." }, { status: 404 });

      const { data: existing, error: existingError } = await context.admin
        .from("crm_whatsapp_connections")
        .select("profile_name")
        .eq("company_id", companyId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return NextResponse.json({ error: "WhatsApp connection not found." }, { status: 404 });

      const profileName = typeof payload.profile_name === "string" && payload.profile_name.trim()
        ? payload.profile_name.trim().slice(0, 150)
        : existing.profile_name;
      const connection = await resetCompanySession(companyId, company.name, profileName);
      return NextResponse.json({ connection });
    }

    if (action === "create" || action === "reconnect") {
      const requiredPermission = action === "create" ? "can_add" : "can_edit";
      if (!(await hasCompanyPermission(context, companyId, requiredPermission))) {
        return NextResponse.json({ error: `You do not have permission to ${action} WhatsApp for this company.` }, { status: 403 });
      }

      const { data: company, error: companyError } = await context.admin
        .from("crm_companies")
        .select("id, name")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) return NextResponse.json({ error: "CRM company not found." }, { status: 404 });

      if (action === "create") {
        const { data: existing, error: existingError } = await context.admin
          .from("crm_whatsapp_connections")
          .select("id")
          .eq("company_id", companyId)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) return NextResponse.json({ error: "This company already has a WhatsApp connection. Use its card to reconnect or edit it." }, { status: 409 });

        const profileName = typeof payload.profile_name === "string" && payload.profile_name.trim()
          ? payload.profile_name.trim().slice(0, 150)
          : `${company.name} WhatsApp`;
        const { error: insertError } = await context.admin
          .from("crm_whatsapp_connections")
          .insert({
            company_id: companyId,
            status: "connecting",
            profile_name: profileName,
            note: "Starting a Baileys WhatsApp session.",
          });
        if (insertError) throw insertError;
      } else {
        const { data: existing, error: existingError } = await context.admin
          .from("crm_whatsapp_connections")
          .select("id, status, profile_name")
          .eq("company_id", companyId)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return NextResponse.json({ error: "Create a WhatsApp connection before reconnecting." }, { status: 404 });
      }

      const selectedProfileName = typeof payload.profile_name === "string" && payload.profile_name.trim()
        ? payload.profile_name.trim().slice(0, 150)
        : action === "create"
          ? `${company.name} WhatsApp`
          : undefined;
      const connection = await connectCompany(companyId, company.name, selectedProfileName);
      return NextResponse.json({ connection }, { status: action === "create" ? 201 : 200 });
    }

    if (action === "disconnect") {
      if (!(await hasCompanyPermission(context, companyId, "can_edit"))) {
        return NextResponse.json({ error: "You do not have permission to disconnect WhatsApp for this company." }, { status: 403 });
      }
      await disconnectCompany(companyId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "Could not update the WhatsApp connection.");
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getRequestContext();
    if (context.error) return NextResponse.json({ error: context.error }, { status: 403 });
    const payload = await readPayload(request);
    const companyId = Number(payload?.company_id);
    const profileName = typeof payload?.profile_name === "string" ? payload.profile_name.trim() : "";
    if (!Number.isInteger(companyId) || companyId <= 0 || !profileName) {
      return NextResponse.json({ error: "A valid company id and profile name are required." }, { status: 400 });
    }
    if (!(await hasCompanyPermission(context, companyId, "can_edit"))) {
      return NextResponse.json({ error: "You do not have permission to edit this WhatsApp connection." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await context.admin
      .from("crm_whatsapp_connections")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "WhatsApp connection not found." }, { status: 404 });

    await updateCompanyConnection(companyId, profileName);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Could not edit the WhatsApp connection.");
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getRequestContext();
    if (context.error) return NextResponse.json({ error: context.error }, { status: 403 });
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "A valid company id is required." }, { status: 400 });
    }
    if (!(await hasCompanyPermission(context, companyId, "can_delete"))) {
      return NextResponse.json({ error: "You do not have permission to delete this WhatsApp connection." }, { status: 403 });
    }

    await deleteCompanyConnection(companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Could not delete the WhatsApp connection.");
  }
}
