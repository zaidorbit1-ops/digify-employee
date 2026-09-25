import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export async function getCompanyAccessContext() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sessionClient.from("profiles").select("role, employee_id").eq("user_id", user.id).single();
  if (profile?.role === "superadmin") return { isSuperadmin: true, allowedCompanyIds: [] as number[] };
  if (profile?.role !== "employee" || !profile.employee_id) return { isSuperadmin: false, allowedCompanyIds: [] as number[] };

  const service = getSupabaseServiceRoleClient();
  const [{ data: permission }, { data: access }] = await Promise.all([
    service.from("permissions").select("can_read").eq("employee_id", profile.employee_id).eq("module", "company_accounts").maybeSingle(),
    service.from("employee_company_access").select("company_id").eq("employee_id", profile.employee_id),
  ]);

  return {
    isSuperadmin: false,
    allowedCompanyIds: permission?.can_read ? (access ?? []).map((item) => item.company_id) : [],
  };
}

export async function canAccessCompany(companyId: number) {
  const context = await getCompanyAccessContext();
  return Boolean(context?.isSuperadmin || context?.allowedCompanyIds.includes(companyId));
}
