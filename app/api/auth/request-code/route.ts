import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const genericResponse = { status: "sent" as const };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const email =
    typeof body === "object" && body !== null && "email" in body &&
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  try {
    const admin = getSupabaseServiceRoleClient();
    const { data: account, error: lookupError } = await admin
      .rpc("lookup_login_account_status", { p_email: email })
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!account) {
      return NextResponse.json(genericResponse, { headers: { "Cache-Control": "no-store" } });
    }
    if (
      typeof account !== "object" ||
      !("is_active" in account) ||
      typeof account.is_active !== "boolean"
    ) {
      throw new Error("Login account status lookup returned an invalid response.");
    }
    if (!account.is_active) {
      return NextResponse.json({ status: "blocked" }, { headers: { "Cache-Control": "no-store" } });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("Supabase authentication is not configured.");
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: sendError } = await authClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (sendError?.code === "user_banned") {
      return NextResponse.json({ status: "blocked" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (sendError && sendError.code !== "signup_disabled") throw sendError;

    return NextResponse.json(genericResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not process sign-in code request:", error);
    return NextResponse.json(
      { error: "Could not process the sign-in request. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
