import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid expert is required." }, { status: 400 });
    const [{ data: expert, error: expertError }, { data: orders, error: ordersError }] = await Promise.all([
      client.from("crm_experts").select("id, name, email, service_area, status, created_at, updated_at, deleted_at").eq("id", id).maybeSingle(),
      client.from("crm_orders").select("id, public_order_id, lead_id, service_name, service_charges, service_deadline, status, created_at, completed_at, crm_leads(id, name, email, crm_companies(name))").eq("expert_id", id).order("created_at", { ascending: false }),
    ]);
    if (expertError) throw expertError;
    if (ordersError) throw ordersError;
    if (!expert) return NextResponse.json({ error: "Expert not found." }, { status: 404 });
    const history = orders ?? [];
    return NextResponse.json({ expert, orders: history, summary: { total: history.length, pending: history.filter((order) => order.status === "pending").length, in_progress: history.filter((order) => order.status === "in_progress").length, completed: history.filter((order) => order.status === "completed").length, cancelled: history.filter((order) => order.status === "cancelled").length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load expert details." }, { status: 500 });
  }
}