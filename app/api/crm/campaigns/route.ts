import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { sendHostingerEmail } from "@/lib/hostinger-mail";
import { withCrmApiLogging } from "@/lib/crm-logs";
import { getCrmCampaignRollingStatus } from "@/lib/crm-hostinger-quota";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const statuses = ["draft", "scheduled", "running", "manual_pause", "rate_limit_pause", "completed", "cancelled", "failed"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status: value.code === "23505" ? 409 : status });
}

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function campaignValues(body: Record<string, unknown>) {
  const companyId = Number(body.company_id);
  const name = text(body.name, 150);
  const segmentId = body.segment_id ? Number(body.segment_id) : null;
  const contactListId = body.contact_list_id ? Number(body.contact_list_id) : null;
  const templateId = body.template_id ? Number(body.template_id) : 0;
  const mailboxId = body.mailbox_id ? Number(body.mailbox_id) : 0;
  const scheduleAt = text(body.schedule_at, 80) || null;
  const intervalSeconds = Number(body.interval_seconds ?? 180);
  const batchSize = Number(body.batch_size ?? 1);
  const status = text(body.status, 20) || "draft";
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("A valid company is required.");
  if (!name) throw new Error("Campaign name is required.");
  if (!Number.isInteger(templateId) || templateId <= 0) throw new Error("Select an email template.");
  if (!Number.isInteger(mailboxId) || mailboxId <= 0) throw new Error("Select a sender mailbox.");
  if (contactListId !== null && (!Number.isInteger(contactListId) || contactListId <= 0)) throw new Error("Choose a valid contact list.");
  if (segmentId && contactListId) throw new Error("Choose either a contact list or a dynamic segment, not both.");
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) throw new Error("Interval must be at least 1 second.");
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Batch size must be at least 1.");
  if (!statuses.includes(status)) throw new Error("Choose a valid campaign status.");
  if (scheduleAt && Number.isNaN(new Date(scheduleAt).getTime())) throw new Error("Schedule must be a valid date and time.");
  return { company_id: companyId, name, segment_id: segmentId, contact_list_id: contactListId, template_id: templateId, mailbox_id: mailboxId, from_name: text(body.from_name, 255) || null, reply_to: text(body.reply_to, 320) || null, subject: text(body.subject, 500) || null, schedule_at: scheduleAt, interval_seconds: intervalSeconds, batch_size: batchSize, status };
}

async function validateCampaignRelations(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], values: ReturnType<typeof campaignValues>) {
  const [templateResult, mailboxResult, segmentResult, listResult] = await Promise.all([
    client.from("crm_email_templates").select("id, company_id, status").eq("id", values.template_id).maybeSingle(),
    client.from("crm_mailboxes").select("id, company_id, status").eq("id", values.mailbox_id).maybeSingle(),
    values.segment_id ? client.from("crm_segments").select("id, company_id").eq("id", values.segment_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    values.contact_list_id ? client.from("crm_contact_lists").select("id, company_id").eq("id", values.contact_list_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [templateResult, mailboxResult, segmentResult, listResult]) if (result.error) throw result.error;
  if (templateResult.data?.company_id !== values.company_id) throw new Error("The selected template does not belong to this company.");
  if (mailboxResult.data?.company_id !== values.company_id) throw new Error("The selected mailbox does not belong to this company.");
  if (values.segment_id && segmentResult.data?.company_id !== values.company_id) throw new Error("The selected audience does not belong to this company.");
  if (values.contact_list_id && listResult.data?.company_id !== values.company_id) throw new Error("The selected contact list does not belong to this company.");
  if (["scheduled", "running"].includes(values.status) && templateResult.data.status !== "active") throw new Error("Activate the selected template before scheduling campaign delivery.");
  if (["scheduled", "running"].includes(values.status) && mailboxResult.data.status !== "connected") throw new Error("Connect the selected mailbox before scheduling campaign delivery.");
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    let query = client.from("crm_campaigns").select("*, crm_email_templates(name, subject), crm_mailboxes(id, email_address), crm_contact_lists(name)").order("updated_at", { ascending: false });
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throw error;
    let mailboxQuery = client.from("crm_mailboxes").select("id").eq("status", "connected");
    if (companyId) mailboxQuery = mailboxQuery.eq("company_id", companyId);
    const { data: visibleMailboxes, error: mailboxError } = await mailboxQuery;
    if (mailboxError) throw mailboxError;
    const visibleMailboxIds = new Set((visibleMailboxes ?? []).map((mailbox) => mailbox.id));
    const quotaRows = await getCrmCampaignRollingStatus(companyId || null);
    const rollingQuotas = quotaRows.filter((quota) => visibleMailboxIds.has(quota.mailbox_id));
    const campaigns = await Promise.all((data ?? []).map(async (campaign) => {
      const { count, error: countError } = await client.from("crm_campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["queued", "processing"]);
      if (countError) throw countError;
      return { ...campaign, remaining_contacts: count ?? 0 };
    }));
    return NextResponse.json({ campaigns, rollingQuotas });
  } catch (error) { return fail(error, "Could not load campaigns."); }
}

export const POST = withCrmApiLogging(async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    if (text(body.action) === "test") {
      const mailboxId = Number(body.mailbox_id);
      const to = text(body.to, 320);
      const subject = text(body.subject, 500);
      const html = text(body.html_body, 100000);
      if (!mailboxId || !to || !subject || !html) return fail("Mailbox, recipient, subject, and preview are required.", "Test details are incomplete.", 400);
      const { data: mailbox, error: mailboxError } = await client.from("crm_mailboxes").select("*").eq("id", mailboxId).single();
      if (mailboxError) throw mailboxError;
      if (mailbox.status !== "connected") return fail("Connect the selected mailbox before sending a test.", "Mailbox is not connected.", 400);
      await sendHostingerEmail({ to, subject: `[TEST] ${subject}`, html, text: text(body.text_body, 100000) || subject, mailboxAddress: mailbox.email_address });
      return NextResponse.json({ ok: true, message: "Campaign test email sent." });
    }
    const values = campaignValues(body);
    if (!["draft", "scheduled"].includes(values.status)) throw new Error("New campaigns must be saved as a draft or scheduled.");
    await validateCampaignRelations(client, values);
    const { data, error } = await client.from("crm_campaigns").insert(values).select().single();
    if (error) throw error;
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) { return fail(error, "Could not create campaign.", 400); }
});

export const PATCH = withCrmApiLogging(async function PATCH(request: Request) {
  try {
    const auth = await getCrmAdminClient();
    const { client, error: authError } = auth;
    if (authError) return fail(authError, authError, 403);
    const profile = "profile" in auth ? auth.profile : undefined;
    const permissions = "permissions" in auth ? auth.permissions : undefined;
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid campaign is required.", "A valid campaign is required.", 400);
    if (text(body.action) === "pause" || text(body.action) === "resume") {
      if (profile?.role === "employee" && !permissions?.some((permission) => permission.module === "crm_campaigns" && permission.can_edit)) {
        return fail("Campaign edit permission is required.", "Campaign edit permission is required.", 403);
      }
      const { data: visibleCampaign, error: visibilityError } = await client.from("crm_campaigns").select("id").eq("id", id).maybeSingle();
      if (visibilityError) throw visibilityError;
      if (!visibleCampaign) return fail("Campaign is not available.", "Campaign is not available.", 404);
      const { data, error } = await getSupabaseServiceRoleClient().rpc("set_crm_campaign_manual_pause", {
        p_campaign_id: id,
        p_action: text(body.action),
      });
      if (error) throw error;
      const campaign = Array.isArray(data) ? data[0] : data;
      if (!campaign) throw new Error("Could not update campaign pause status.");
      return NextResponse.json({ campaign });
    }
    const values = campaignValues(body);
    if (!statuses.includes(values.status)) throw new Error("Choose a valid campaign status.");
    await validateCampaignRelations(client, values);
    const editableValues = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "status"));
    const { data, error } = await client.from("crm_campaigns").update({ ...editableValues, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ campaign: data });
  } catch (error) { return fail(error, "Could not update campaign.", 400); }
});

export const DELETE = withCrmApiLogging(async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return fail("A valid campaign is required.", "A valid campaign is required.", 400);
    const { error } = await client.from("crm_campaigns").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error, "Could not delete campaign."); }
});
