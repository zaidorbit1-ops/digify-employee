import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type SubscriptionPayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

async function getAuthenticatedUser() {
  const client = await getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  return { client, user };
}

export async function POST(request: Request) {
  const { client, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: SubscriptionPayload;
  try {
    body = await request.json() as SubscriptionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  try {
    if (new URL(endpoint).protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.json({ error: "A valid push endpoint is required." }, { status: 400 });
  }
  if (!p256dh || !auth) return NextResponse.json({ error: "Push encryption keys are required." }, { status: 400 });

  const { error } = await client.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint, p256dh, auth },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "Could not save this device subscription." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { client, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let endpoint: unknown;
  try {
    endpoint = (await request.json() as { endpoint?: unknown }).endpoint;
  } catch {
    return NextResponse.json({ error: "Invalid subscription payload." }, { status: 400 });
  }
  if (typeof endpoint !== "string" || !endpoint) return NextResponse.json({ error: "A valid endpoint is required." }, { status: 400 });

  const { error } = await client.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not remove this device subscription." }, { status: 500 });
  return NextResponse.json({ ok: true });
}