import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid contact is required." }, { status: 400 });
    const { data, error } = await client.from("crm_contact_timeline").select("*").eq("contact_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ timeline: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load contact timeline." }, { status: 500 });
  }
}
