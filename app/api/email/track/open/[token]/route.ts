import { recordCampaignTrackingRequest } from "@/lib/crm-campaign-tracking";

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    await recordCampaignTrackingRequest(token, "opened", request);
  } catch (error) {
    console.error("Campaign open tracking event could not be recorded:", error instanceof Error ? error.message : "Unknown error");
  }

  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(pixel.length),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
