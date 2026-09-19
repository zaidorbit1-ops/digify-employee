import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

const statuses = ["new", "contacted", "qualified", "converted", "lost"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const companyId = params.get("company_id");
    const status = params.get("status");
    const websiteId = params.get("website_id");
    const search = params.get("search")?.trim();
    let query = client.from("crm_leads").select("*, crm_websites(name, website_url)").order("created_at", { ascending: false });
    if (companyId) query = query.eq("company_id", Number(companyId));
    if (status && statuses.includes(status)) query = query.eq("status", status);
    if (websiteId) query = query.eq("website_id", Number(websiteId));
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    const from = params.get("from");
    const to = params.get("to");
    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ leads: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load CRM leads.");
  }
}