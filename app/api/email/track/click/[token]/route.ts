import { recordCampaignTrackingRequest } from "@/lib/crm-campaign-tracking";

function safeTarget(value: string | null) {
  if (!value) return "/";
  try {
    const target = new URL(value);
    return ["http:", "https:"].includes(target.protocol) ? target.toString() : "/";
  } catch {
    return "/";
  }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  let redirect = "/";
  let token = "";
  const fallback = safeTarget(new URL(request.url).searchParams.get("url"));
  try {
    ({ token } = await context.params);
    const result = await recordCampaignTrackingRequest(token, "clicked", request);
    if (result) redirect = safeTarget(result.targetUrl || fallback);
  } catch (error) {
    console.error("Campaign click tracking event could not be recorded:", error instanceof Error ? error.message : "Unknown error");
  }
  return Response.redirect(new URL(redirect, request.url), 302);
}
