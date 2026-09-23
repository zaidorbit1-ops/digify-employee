import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

const statuses = ["new", "contacted", "qualified", "converted", "lost"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const companyId = params.get("company_id");
    const status = params.get("status");
    const websiteId = params.get("website_id");
    const search = params.get("search")?.trim();
    let query = client.from("crm_leads").select("*, crm_websites(name, website_url), crm_orders(id, public_order_id, service_name, status, created_at, completed_at)").is("deleted_at", null).order("created_at", { ascending: false });
    if (companyId) query = query.eq("company_id", Number(companyId));
    if (status && statuses.includes(status)) query = query.eq("status", status);
    if (websiteId) query = query.eq("website_id", Number(websiteId));
    if (search) {
      const cleanSearch = search.replace(/^#/, "").replace(/[^a-zA-Z0-9@+ ._-]/g, "");
      const { data: matchingOrders, error: orderSearchError } = await client
        .from("crm_orders")
        .select("lead_id")
        .ilike("public_order_id", `%${cleanSearch}%`);
      if (orderSearchError) throw orderSearchError;
      const orderLeadIds = Array.from(new Set((matchingOrders ?? []).map((order) => order.lead_id).filter(Boolean)));
      const orderClause = orderLeadIds.length ? `,id.in.(${orderLeadIds.join(",")})` : "";
      query = query.or(`name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%${orderClause}`);
    }
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

export async function POST(request: Request) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim() || null;
    const companyId = Number(body.company_id);
    const websiteId = Number(body.website_id);
    if (!name || !email || !Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(websiteId) || websiteId <= 0) {
      return fail("Lead name, email, company, and website are required.", "Lead name, email, company, and website are required.", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Lead email is invalid.", "Lead email is invalid.", 400);
    const sourceUrl = String(body.source_url ?? "").trim();
    if (sourceUrl) {
      try { const parsed = new URL(sourceUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { return fail("Source URL must be a valid HTTP or HTTPS URL.", "Source URL must be a valid HTTP or HTTPS URL.", 400); }
    }
    const { data: website, error: websiteError } = await client.from("crm_websites").select("id, company_id").eq("id", websiteId).maybeSingle();
    if (websiteError) throw websiteError;
    if (!website || website.company_id !== companyId) return fail("Website does not belong to the selected company.", "Website does not belong to the selected company.", 400);
    const { data: company, error: companyError } = await client.from("crm_companies").select("id").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return fail("CRM company not found.", "CRM company not found.", 404);
    const { data: duplicate } = await client.from("crm_leads").select("id").eq("company_id", companyId).eq("normalized_email", email).is("deleted_at", null).limit(1).maybeSingle();
    const { data, error } = await client.from("crm_leads").insert({
      company_id: companyId,
      website_id: websiteId,
      name: name.slice(0, 255),
      email: email.slice(0, 320),
      normalized_email: email.slice(0, 320),
      phone: phone?.slice(0, 80) ?? null,
      message: String(body.message ?? "").trim() || null,
      form_name: String(body.form_name ?? "").trim() || null,
      source_url: sourceUrl || null,
      custom_data: body.custom_data && typeof body.custom_data === "object" && !Array.isArray(body.custom_data) ? body.custom_data : {},
      source: String(body.source_name ?? "manual").trim().slice(0, 100) || "manual",
      status: "new",
      created_by: user.id,
      updated_by: user.id,
    }).select("*, crm_websites(name, website_url)").single();
    if (error) throw error;
    return NextResponse.json({ lead: data, duplicate: Boolean(duplicate), duplicate_of: duplicate?.id ?? null }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create CRM lead.");
  }
}