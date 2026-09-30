import webpush from "web-push";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

type CrmPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  notificationType: "crm_lead" | "crm_email";
  relatedRecordId: number;
};

export async function sendCrmPush(payload: CrmPushPayload) {
  try {
    const client = getSupabaseServiceRoleClient();
    const { data: admins, error: adminsError } = await client
      .from("profiles")
      .select("user_id")
      .eq("role", "superadmin")
      .eq("is_active", true);
    if (adminsError) throw adminsError;

    const userIds = (admins ?? []).map((admin) => admin.user_id);
    if (!userIds.length) return;

    const { error: notificationError } = await client.from("notifications").insert(
      userIds.map((recipientId) => ({
        recipient_id: recipientId,
        type: payload.notificationType,
        message: `${payload.title}: ${payload.body}`,
        related_record_id: payload.relatedRecordId,
      })),
    );
    if (notificationError) throw notificationError;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return;

    const { data: subscriptions, error: subscriptionsError } = await client
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return;

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      publicKey,
      privateKey,
    );

    await Promise.all(subscriptions.map(async (item) => {
      try {
        await webpush.sendNotification({
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        }, JSON.stringify(payload));
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await client.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
          return;
        }
        console.error("[web-push] notification delivery failed", { status_code: statusCode });
      }
    }));
  } catch (error) {
    console.error("[web-push] CRM notification failed", error instanceof Error ? error.message : "unknown error");
  }
}