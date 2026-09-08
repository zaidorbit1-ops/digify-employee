import { NextResponse } from "next/server";
import { decryptCompanyPassword } from "@/lib/company-accounts-crypto";
import { supabase } from "@/lib/supabase";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid account is required." }, { status: 400 });

    const { data, error } = await supabase.from("company_accounts").select("encrypted_password").eq("id", id).single();
    if (error) throw error;
    return NextResponse.json({ password: decryptCompanyPassword(String(data.encrypted_password)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reveal password." }, { status: 500 });
  }
}
