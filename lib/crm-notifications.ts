import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

type CrmNotificationPayload = {
  body: string;
  notificationType: "crm_lead" | "crm_email";
  relatedRecordId: number;
  relatedUrl: string;
  companyId: number;
};

export async function createCrmActivityNotifications(payload: CrmNotificationPayload) {
  try {
    const client = getSupabaseServiceRoleClient();
    const { data: admins, error: adminsError } = await client
      .from("profiles")
      .select("user_id")
      .eq("role", "superadmin")
      .eq("is_active", true);
    if (adminsError) throw adminsError;

    const module = payload.notificationType === "crm_lead" ? "crm_leads" : "crm_webmail";
    const { data: employeeProfiles, error: profilesError } = await client
      .from("profiles")
      .select("user_id, employee_id")
      .eq("role", "employee")
      .eq("is_active", true)
      .not("employee_id", "is", null);
    if (profilesError) throw profilesError;

    const employeeIds = (employeeProfiles ?? []).map((profile) => profile.employee_id).filter((id): id is number => id !== null);
    let employeeRecipients: string[] = [];
    if (employeeIds.length) {
      const { data: permissions, error: permissionsError } = await client
        .from("permissions")
        .select("employee_id")
        .eq("module", module)
        .eq("can_read", true)
        .in("employee_id", employeeIds);
      if (permissionsError) throw permissionsError;

      const readableEmployeeIds = Array.from(new Set((permissions ?? []).map((permission) => permission.employee_id)));
      if (readableEmployeeIds.length) {
        const { data: grants, error: grantsError } = await client
          .from("employee_crm_module_company_access")
          .select("employee_id")
          .eq("module", module)
          .eq("company_id", payload.companyId)
          .in("employee_id", readableEmployeeIds);
        if (grantsError) throw grantsError;

        const grantedEmployeeIds = new Set((grants ?? []).map((grant) => grant.employee_id));
        employeeRecipients = (employeeProfiles ?? [])
          .filter((profile) => profile.employee_id !== null && grantedEmployeeIds.has(profile.employee_id))
          .map((profile) => profile.user_id);
      }
    }

    const recipientIds = Array.from(new Set([...(admins ?? []).map((admin) => admin.user_id), ...employeeRecipients]));
    if (!recipientIds.length) return;

    const { error } = await client.from("notifications").insert(
      recipientIds.map((recipientId) => ({
        recipient_id: recipientId,
        type: payload.notificationType,
        message: payload.body,
        related_record_id: payload.relatedRecordId,
        related_url: payload.relatedUrl,
        company_id: payload.companyId,
      })),
    );
    if (error) throw error;
  } catch (error) {
    console.error("[crm-notifications] Could not create activity notifications", error instanceof Error ? error.message : "unknown error");
  }
}