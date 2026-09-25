import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncMailbox, type MailboxRecord } from "@/lib/crm-webmail-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRM_WEBMAIL_CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!secret || providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase server credentials are not configured." }, { status: 500 });
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: mailboxes, error } = await client
      .from("crm_mailboxes")
      .select("*")
      .in("status", ["connected", "error"]);
    if (error) throw error;

    const results: Array<{ mailbox_id: number; imported?: number; error?: string }> = [];
    for (const mailbox of mailboxes ?? []) {
      try {
        const imported = await syncMailbox(client, mailbox as MailboxRecord);
        results.push({ mailbox_id: mailbox.id, imported });
      } catch (syncError) {
        results.push({
          mailbox_id: mailbox.id,
          error: syncError instanceof Error ? syncError.message : "Mailbox sync failed.",
        });
      }
    }

    return NextResponse.json({ ok: true, synced: results.length, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron mailbox sync failed." },
      { status: 500 }
    );
  }
}