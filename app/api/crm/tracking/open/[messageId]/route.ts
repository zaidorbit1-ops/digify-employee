import { recordLegacyCampaignTrackingRequest } from "@/lib/crm-campaign-tracking";

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

export async function GET(request: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await context.params;
    const id = Number(messageId);
    if (Number.isInteger(id) && id > 0) {
      await recordLegacyCampaignTrackingRequest(id, "opened", request);
    }
  } catch (error) {
    console.error("Legacy campaign open tracking event could not be recorded:", error instanceof Error ? error.message : "Unknown error");
  }
  return new Response(pixel, { headers: { "Content-Type": "image/gif", "Content-Length": String(pixel.length), "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
