import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}
function startOfDay() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.toISOString(); }
function startOfMonth() { const date = new Date(); date.setDate(1); date.setHours(0, 0, 0, 0); return date.toISOString(); }

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const companyParam = new URL(request.url).searchParams.get("company_id");
    const companyId = companyParam && companyParam !== "all" ? Number(companyParam) : null;
    if (companyId !== null && (!Number.isInteger(companyId) || companyId <= 0)) return fail("A valid company is required.", "A valid company is required.", 400);
    const companiesQuery = client.from("crm_companies").select("id, name, status").order("name");
    const [{ data: companies, error: companiesError }, { data: websites, error: websitesError }, { data: leads, error: leadsError }, { data: contacts, error: contactsError }, { data: campaigns, error: campaignsError }, { data: messages, error: messagesError }, { data: events, error: eventsError }] = await Promise.all([
      companiesQuery,
      client.from("crm_websites").select("id, company_id, name, website_url"),
      client.from("crm_leads").select("id, company_id, website_id, created_at"),
      client.from("crm_contacts").select("id, company_id, created_at"),
      client.from("crm_campaigns").select("id, company_id, name, status"),
      client.from("crm_campaign_messages").select("id, company_id, status, sent_at"),
      client.from("crm_email_events").select("id, company_id, event_type, event_time"),
    ]);
    for (const error of [companiesError, websitesError, leadsError, contactsError, campaignsError, messagesError, eventsError]) if (error) throw error;
    const matches = <T extends { company_id: number }>(rows: T[] | null) => (rows ?? []).filter((row) => companyId === null || row.company_id === companyId);
    const companyRows = (companies ?? []).filter((company) => companyId === null || company.id === companyId);
    const leadRows = matches(leads); const contactRows = matches(contacts); const campaignRows = matches(campaigns); const messageRows = matches(messages); const eventRows = matches(events);
    const day = startOfDay(); const month = startOfMonth();
    const sent = eventRows.filter((event) => event.event_type === "sent").length;
    const delivered = eventRows.filter((event) => event.event_type === "delivered").length;
    const opened = eventRows.filter((event) => event.event_type === "opened").length;
    const websiteStats = (websites ?? []).filter((website) => companyId === null || website.company_id === companyId).map((website) => ({ ...website, company_name: companyRows.find((company) => company.id === website.company_id)?.name ?? "Unknown company", leads: leadRows.filter((lead) => lead.website_id === website.id).length }));
    return NextResponse.json({ companies: companyRows, summary: { leads_today: leadRows.filter((lead) => lead.created_at >= day).length, leads_month: leadRows.filter((lead) => lead.created_at >= month).length, new_contacts: contactRows.filter((contact) => contact.created_at >= month).length, campaigns_running: campaignRows.filter((campaign) => campaign.status === "running").length, emails_sent: sent, failed_emails: messageRows.filter((message) => message.status === "failed").length + eventRows.filter((event) => event.event_type === "failed").length, delivery_rate: sent ? Math.round((delivered / sent) * 100) : 0, open_rate: sent ? Math.round((opened / sent) * 100) : 0, clicks: eventRows.filter((event) => event.event_type === "clicked").length, replies: eventRows.filter((event) => event.event_type === "replied").length }, campaigns: campaignRows, website_stats: websiteStats });
  } catch (error) { return fail(error, "Could not load CRM command center."); }
}
