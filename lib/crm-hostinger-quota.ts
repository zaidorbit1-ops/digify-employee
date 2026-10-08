import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type CrmCampaignRollingStatus = {
  mailbox_id: number;
  company_id: number;
  email_address: string;
  rolling_limit: number;
  sent_last_24_hours: number;
  reserved_sends: number;
  available_capacity: number;
};

export async function getCrmCampaignRollingStatus(companyId?: number | null): Promise<CrmCampaignRollingStatus[]> {
  const { data, error } = await getSupabaseServiceRoleClient().rpc("crm_campaign_rolling_send_status", {
    p_company_id: companyId ?? null,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Could not read per-mailbox campaign sending status.");
  return data as CrmCampaignRollingStatus[];
}
