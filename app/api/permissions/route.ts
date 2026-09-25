import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

function client() {
  return getSupabaseServiceRoleClient();
}

async function requireSuperadmin() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return "Authentication required.";
  const { data: profile, error } = await sessionClient.from("profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (profile?.role !== "superadmin" || profile.is_active === false) return "Superadmin access required.";
  return null;
}

export async function GET() {
  try {
    const authError = await requireSuperadmin();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const [{ data: employees, error: employeesError }, { data: permissions, error: permissionsError }, { data: companies, error: companiesError }, { data: companyAccess, error: companyAccessError }, { data: crmCompanies, error: crmCompaniesError }, { data: crmCompanyAccess, error: crmCompanyAccessError }, { data: crmModuleCompanyAccess, error: crmModuleCompanyAccessError }] = await Promise.all([
      client().from("employees").select("id, name, employee_id, email, status").order("name"),
      client().from("permissions").select("*").order("module"),
      client().from("companies").select("id, name").order("name"),
      client().from("employee_company_access").select("employee_id, company_id"),
      client().from("crm_companies").select("id, name, status").order("name"),
      client().from("employee_crm_company_access").select("employee_id, company_id"),
      client().from("employee_crm_module_company_access").select("employee_id, module, company_id"),
    ]);
    if (employeesError) throw employeesError;
    if (permissionsError) throw permissionsError;
    if (companiesError) throw companiesError;
    if (companyAccessError) throw companyAccessError;
    if (crmCompaniesError) throw crmCompaniesError;
    if (crmCompanyAccessError) throw crmCompanyAccessError;
    if (crmModuleCompanyAccessError) throw crmModuleCompanyAccessError;
    return NextResponse.json({ employees: employees ?? [], permissions: permissions ?? [], companies: companies ?? [], companyAccess: companyAccess ?? [], crmCompanies: crmCompanies ?? [], crmCompanyAccess: crmCompanyAccess ?? [], crmModuleCompanyAccess: crmModuleCompanyAccess ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load permissions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireSuperadmin();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const body = await request.json();
    const employeeId = Number(body.employee_id);

    if (Array.isArray(body.crm_company_ids) && typeof body.module === "string" && body.module.startsWith("crm_")) {
      const module = body.module.trim();
      if (!Number.isInteger(employeeId) || employeeId <= 0 || body.crm_company_ids.some((companyId: unknown) => !Number.isInteger(Number(companyId)) || Number(companyId) <= 0)) {
        return NextResponse.json({ error: "A valid employee, CRM module, and companies are required." }, { status: 400 });
      }
      const companyIds = [...new Set(body.crm_company_ids.map((companyId: number) => Number(companyId)))];
      const service = getSupabaseServiceRoleClient();
      const { error: deleteError } = await service.from("employee_crm_module_company_access").delete().eq("employee_id", employeeId).eq("module", module);
      if (deleteError) throw deleteError;
      if (companyIds.length) {
        const { error: insertError } = await service.from("employee_crm_module_company_access").insert(companyIds.map((companyId) => ({ employee_id: employeeId, module, company_id: companyId })));
        if (insertError) throw insertError;
      }
      return NextResponse.json({ crmModuleCompanyAccess: companyIds.map((companyId) => ({ employee_id: employeeId, module, company_id: companyId })) });
    }

    if (Array.isArray(body.crm_company_ids)) {
      if (!Number.isInteger(employeeId) || employeeId <= 0 || body.crm_company_ids.some((companyId: unknown) => !Number.isInteger(Number(companyId)) || Number(companyId) <= 0)) {
        return NextResponse.json({ error: "A valid employee and CRM companies are required." }, { status: 400 });
      }
      const companyIds = [...new Set(body.crm_company_ids.map((companyId: number) => Number(companyId)))];
      const service = getSupabaseServiceRoleClient();
      const { error: deleteError } = await service.from("employee_crm_company_access").delete().eq("employee_id", employeeId);
      if (deleteError) throw deleteError;
      if (companyIds.length) {
        const { error: insertError } = await service.from("employee_crm_company_access").insert(companyIds.map((companyId) => ({ employee_id: employeeId, company_id: companyId })));
        if (insertError) throw insertError;
      }
      return NextResponse.json({ crmCompanyAccess: companyIds.map((companyId) => ({ employee_id: employeeId, company_id: companyId })) });
    }

    if (Array.isArray(body.company_ids)) {
      if (!Number.isInteger(employeeId) || employeeId <= 0 || body.company_ids.some((companyId: unknown) => !Number.isInteger(Number(companyId)) || Number(companyId) <= 0)) {
        return NextResponse.json({ error: "A valid employee and companies are required." }, { status: 400 });
      }
      const companyIds = [...new Set(body.company_ids.map((companyId: number) => Number(companyId)))];
      const service = getSupabaseServiceRoleClient();
      const { error: deleteError } = await service.from("employee_company_access").delete().eq("employee_id", employeeId);
      if (deleteError) throw deleteError;
      if (companyIds.length) {
        const { error: insertError } = await service.from("employee_company_access").insert(companyIds.map((companyId) => ({ employee_id: employeeId, company_id: companyId })));
        if (insertError) throw insertError;
      }
      return NextResponse.json({ companyAccess: companyIds.map((companyId) => ({ employee_id: employeeId, company_id: companyId })) });
    }

    const module = String(body.module ?? "").trim();
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !module) {
      return NextResponse.json({ error: "A valid employee and module are required." }, { status: 400 });
    }

    const values = {
      employee_id: employeeId,
      module,
      can_read: body.can_read === true,
      can_add: body.can_add === true,
      can_edit: body.can_edit === true,
      can_delete: body.can_delete === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client().from("permissions").upsert(values, { onConflict: "employee_id,module" }).select().single();
    if (error) throw error;
    return NextResponse.json({ permission: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save permissions." }, { status: 500 });
  }
}
