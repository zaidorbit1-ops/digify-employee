import { recordLegacyCampaignTrackingRequest } from "@/lib/crm-campaign-tracking";

export async function GET(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const target = new URL(request.url).searchParams.get("url") || "/";
  let redirect = "/";
  try {
    const parsed = new URL(target);
    if (["http:", "https:"].includes(parsed.protocol)) redirect = parsed.toString();
  } catch { /* Invalid targets fall back to the application root. */ }

  try {
    const { messageId } = await context.params;
    const id = Number(messageId);
    if (Number.isInteger(id) && id > 0) {
      await recordLegacyCampaignTrackingRequest(id, "clicked", request, redirect);
    }
  } catch (error) {
    console.error("Legacy campaign click tracking event could not be recorded:", error instanceof Error ? error.message : "Unknown error");
  }
  return Response.redirect(redirect, 302);
}
