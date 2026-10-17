import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type WhatsAppPermission = "can_read" | "can_add" | "can_edit";

export type WhatsAppAccessResult =
  | { allowed: true }
  | { allowed: false; status: number; error: string };

export async function authorizeWhatsAppCompany(
  companyId: number,
  permissionAction: WhatsAppPermission,
): Promise<WhatsAppAccessResult> {
  const client = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user) return { allowed: false, status: 401, error: "Authentication required." };

  const admin = getSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.is_active === false) {
    return { allowed: false, status: 403, error: "Account access is not available." };
  }
  if (profile.role === "superadmin") return { allowed: true };
  if (profile.role !== "employee" || !profile.employee_id) {
    return { allowed: false, status: 403, error: "Business CRM access required." };
  }

  const { data: permission, error: permissionError } = await admin
    .from("permissions")
    .select("can_read, can_add, can_edit")
    .eq("employee_id", profile.employee_id)
    .eq("module", "crm_whatsapp")
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission?.[permissionAction]) {
    return { allowed: false, status: 403, error: "You do not have permission to access this WhatsApp account." };
  }

  const { data: access, error: accessError } = await admin
    .from("employee_crm_module_company_access")
    .select("company_id")
    .eq("employee_id", profile.employee_id)
    .eq("module", "crm_whatsapp")
    .eq("company_id", companyId)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access) {
    return { allowed: false, status: 403, error: "You do not have access to this company's WhatsApp account." };
  }
  return { allowed: true };
}