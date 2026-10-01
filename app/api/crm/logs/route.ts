import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const levels = ["success", "info", "warning", "error"] as const;

function idsFor(logs: Record<string, any>[], key: string, resourceType?: string) {
  return [...new Set(logs.flatMap((log) => {
    const metadata = log.metadata ?? {};
    const direct = log[key] ?? metadata[key];
    const resource = resourceType && metadata.resource_type === resourceType ? metadata.resource_id : null;
    const value = Number(direct ?? resource);
    return Number.isSafeInteger(value) && value > 0 ? [value] : [];
  }))];
}

async function lookup(client: ReturnType<typeof getSupabaseServiceRoleClient>, table: string, fields: string, ids: number[]) {
  if (!ids.length) return [];
  const { data, error } = await client.from(table).select(fields).in("id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function GET(request: Request) {
  try {
    const { error: authError, profile } = await getCrmAdminContext();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (profile?.role !== "superadmin") return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const level = params.get("level");
    const search = params.get("search")?.trim().replace(/[,%()]/g, "").slice(0, 100);
    const client = getSupabaseServiceRoleClient();
    let query = client.from("crm_system_logs").select("id, created_at, level, source, event, message, route, request_id, company_id, metadata").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300);
    if (levels.includes(level as (typeof levels)[number])) query = query.eq("level", level);
    if (search) query = query.or(`message.ilike.%${search}%,event.ilike.%${search}%,source.ilike.%${search}%,route.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    const logs = data ?? [];
    const [companies, mailboxes, campaigns, leads, contacts, templates, websites, orders, experts] = await Promise.all([
      lookup(client, "crm_companies", "id, name", idsFor(logs, "company_id")),
      lookup(client, "crm_mailboxes", "id, email_address, display_name", idsFor(logs, "mailbox_id", "mailbox")),
      lookup(client, "crm_campaigns", "id, name, status", idsFor(logs, "campaign_id", "campaign")),
      lookup(client, "crm_leads", "id, name", idsFor(logs, "lead_id", "lead")),
      lookup(client, "crm_contacts", "id, full_name", idsFor(logs, "contact_id", "contact")),
      lookup(client, "crm_email_templates", "id, name", idsFor(logs, "template_id", "template")),
      lookup(client, "crm_websites", "id, name", idsFor(logs, "website_id", "website")),
      lookup(client, "crm_orders", "id, public_order_id, service_name", idsFor(logs, "order_id", "order")),
      lookup(client, "crm_experts", "id, name", idsFor(logs, "expert_id", "expert")),
    ]);
    const companyMap = new Map(companies.map((row: any) => [row.id, row.name]));
    const mailboxMap = new Map(mailboxes.map((row: any) => [row.id, `${row.display_name || row.email_address} · ${row.email_address}`]));
    const campaignMap = new Map(campaigns.map((row: any) => [row.id, row.name]));
    const leadMap = new Map(leads.map((row: any) => [row.id, row.name]));
    const contactMap = new Map(contacts.map((row: any) => [row.id, row.full_name]));
    const templateMap = new Map(templates.map((row: any) => [row.id, row.name]));
    const websiteMap = new Map(websites.map((row: any) => [row.id, row.name]));
    const orderMap = new Map(orders.map((row: any) => [row.id, `${row.public_order_id} · ${row.service_name}`]));
    const expertMap = new Map(experts.map((row: any) => [row.id, row.name]));
    const enriched = logs.map((log: Record<string, any>) => {
      const metadata = log.metadata ?? {};
      const resourceId = Number(metadata.resource_id);
      const type = String(metadata.resource_type ?? "");
      const resourceMaps: Record<string, Map<number, unknown>> = { mailbox: mailboxMap, campaign: campaignMap, lead: leadMap, contact: contactMap, template: templateMap, website: websiteMap, order: orderMap, expert: expertMap };
      const resourceName = resourceMaps[type]?.get(resourceId);
      return {
        ...log,
        context: {
          company: companyMap.get(Number(log.company_id ?? metadata.company_id)) ?? null,
          mailbox: mailboxMap.get(Number(metadata.mailbox_id)) ?? (type === "mailbox" ? resourceName : null),
          campaign: campaignMap.get(Number(metadata.campaign_id)) ?? (type === "campaign" ? resourceName : null),
          lead: leadMap.get(Number(metadata.lead_id)) ?? (type === "lead" ? resourceName : null),
          contact: contactMap.get(Number(metadata.contact_id)) ?? (type === "contact" ? resourceName : null),
          template: templateMap.get(Number(metadata.template_id)) ?? (type === "template" ? resourceName : null),
          website: websiteMap.get(Number(metadata.website_id)) ?? (type === "website" ? resourceName : null),
          order: orderMap.get(Number(metadata.order_id)) ?? (type === "order" ? resourceName : null),
          expert: expertMap.get(Number(metadata.expert_id)) ?? (type === "expert" ? resourceName : null),
          resource: resourceName ? `${type} #${resourceId}: ${resourceName}` : type && resourceId ? `${type} #${resourceId}` : null,
        },
      };
    });
    return NextResponse.json({ logs: enriched });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load system logs." }, { status: 500 });
  }
}