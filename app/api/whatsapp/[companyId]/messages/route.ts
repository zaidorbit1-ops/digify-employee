import { NextResponse } from "next/server";
import { authorizeWhatsAppCompany } from "@/lib/whatsapp-access";
import { getCompanyInboxMessages, sendCompanyTextMessage } from "@/lib/whatsapp-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ companyId: string }> };

function validChatJid(jid: string) {
  return jid.length <= 256 && /^[^@\s]+@(s\.whatsapp\.net|lid|g\.us)$/.test(jid);
}

function errorResponse(error: unknown, fallback: string) {
  console.error("[WhatsApp] Inbox message request failed:", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(request: Request, { params }: RouteContext) {
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

    const url = new URL(request.url);
    const jid = url.searchParams.get("jid") ?? "";
    if (!validChatJid(jid)) {
      return NextResponse.json({ error: "A valid WhatsApp chat id is required." }, { status: 400 });
    }

    const beforeValue = url.searchParams.get("before");
    const before = beforeValue === null ? undefined : Number(beforeValue);
    if (before !== undefined && (!Number.isFinite(before) || before <= 0)) {
      return NextResponse.json({ error: "The message cursor is invalid." }, { status: 400 });
    }

    return NextResponse.json({ messages: getCompanyInboxMessages(companyId, jid, before) });
  } catch (error) {
    return errorResponse(error, "Could not load WhatsApp messages.");
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { companyId: rawCompanyId } = await params;
    const companyId = Number(rawCompanyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "A valid company id is required." }, { status: 400 });
    }

    const access = await authorizeWhatsAppCompany(companyId, "can_add");
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }

    const body = payload as { jid?: unknown; text?: unknown };
    const jid = typeof body.jid === "string" ? body.jid : "";
    const text = typeof body.text === "string" ? body.text : "";
    if (!validChatJid(jid)) {
      return NextResponse.json({ error: "A valid WhatsApp chat id is required." }, { status: 400 });
    }
    if (!text.trim() || text.length > 65_536) {
      return NextResponse.json({ error: "Enter a message of up to 65,536 characters." }, { status: 400 });
    }

    const messageId = await sendCompanyTextMessage(companyId, jid, text);
    return NextResponse.json({ success: true, message_id: messageId });
  } catch (error) {
    return errorResponse(error, "Could not send WhatsApp message.");
  }
}