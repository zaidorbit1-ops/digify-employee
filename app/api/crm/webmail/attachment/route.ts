import { NextResponse } from "next/server";
import { findHostingerMessage, getHostingerMessageAttachment } from "@/lib/hostinger-mail";
import { getCrmAdminClient } from "@/lib/crm-admin";

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return failure(authError, 403);

    const params = new URL(request.url).searchParams;
    const attachmentId = Number(params.get("attachment_id"));
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) return failure("A valid attachment is required.", 400);

    const { data: attachment, error: attachmentError } = await client
      .from("crm_email_attachments")
      .select("id, message_id, file_name, content_type, storage_path")
      .eq("id", attachmentId)
      .maybeSingle();
    if (attachmentError) throw attachmentError;
    if (!attachment) return failure("Attachment not found.", 404);

    const contentType = attachment.content_type || "application/octet-stream";
    const fileName = attachment.file_name.replace(/[\r\n"\\]/g, "_");
    const inlineRequested = params.get("inline") === "1" && /^image\/(?:png|jpe?g|gif|webp|avif)$/i.test(contentType);
    const headers = {
      "Content-Type": contentType,
      "Content-Disposition": `${inlineRequested ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    if (attachment.storage_path.startsWith("data:")) {
      const comma = attachment.storage_path.indexOf(",");
      if (comma < 0) return failure("Attachment data is invalid.", 422);
      const metadata = attachment.storage_path.slice(0, comma);
      const payload = attachment.storage_path.slice(comma + 1);
      const bytes = metadata.endsWith(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
      return new Response(bytes, { headers });
    }

    const providerAttachmentId = attachment.storage_path.startsWith("hostinger:attachment:")
      ? attachment.storage_path.slice("hostinger:attachment:".length)
      : "";
    if (!providerAttachmentId) return failure("This attachment is no longer available from the mailbox provider.", 404);

    const { data: message, error: messageError } = await client
      .from("crm_email_messages")
      .select("mailbox_id, hostinger_uid, hostinger_folder, message_id")
      .eq("id", attachment.message_id)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message?.mailbox_id) return failure("The attachment mailbox could not be found.", 404);

    const { data: mailbox, error: mailboxError } = await client
      .from("crm_mailboxes")
      .select("email_address")
      .eq("id", message.mailbox_id)
      .maybeSingle();
    if (mailboxError) throw mailboxError;
    if (!mailbox?.email_address) return failure("The attachment mailbox could not be found.", 404);

    let uid = Number(message.hostinger_uid);
    let folder = message.hostinger_folder || "INBOX";
    if ((!Number.isInteger(uid) || uid <= 0) && message.message_id) {
      const providerMessage = await findHostingerMessage(mailbox.email_address, folder, message.message_id);
      if (providerMessage?.uid) {
        uid = providerMessage.uid;
        folder = providerMessage.path || folder;
        await client.from("crm_email_messages").update({ hostinger_uid: uid, hostinger_folder: folder }).eq("id", attachment.message_id);
      }
    }
    if (!Number.isInteger(uid) || uid <= 0) return failure("The provider message for this attachment could not be found.", 404);

    const file = await getHostingerMessageAttachment(mailbox.email_address, folder, uid, providerAttachmentId);
    return new Response(file, { headers });
  } catch (error) {
    console.error("[hostinger] attachment download failed", error instanceof Error ? error.message : "unknown error");
    return failure("Could not download this email attachment.", 502);
  }
}