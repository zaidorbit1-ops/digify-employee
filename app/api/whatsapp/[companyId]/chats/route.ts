import { NextResponse } from "next/server";
import { authorizeWhatsAppCompany } from "@/lib/whatsapp-access";
import { ensureCompanySession, getCompanyInboxSnapshot } from "@/lib/whatsapp-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { companyId: rawCompanyId } = await params;
    const companyId = Number(rawCompanyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "A valid company id is required." }, { status: 400 });
    }

    const access = await authorizeWhatsAppCompany(companyId, "can_read");
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    await ensureCompanySession(companyId);
    return NextResponse.json({ inbox: getCompanyInboxSnapshot(companyId) });
  } catch (error) {
    console.error("[WhatsApp] Could not load company inbox:", error);
    return NextResponse.json({ error: "Could not load WhatsApp chats." }, { status: 500 });
  }
}