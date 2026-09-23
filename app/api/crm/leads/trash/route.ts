import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

export async function GET() {
  const { client, error } = await getCrmAdminContext();
  if (error) return NextResponse.json({ error }, { status: 403 });
  const { data, error: queryError } = await client
    .from("crm_leads")
    .select("*, crm_websites(name, website_url), crm_companies(name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}