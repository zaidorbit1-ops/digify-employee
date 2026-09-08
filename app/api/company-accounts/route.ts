import { NextResponse } from "next/server";
import { encryptCompanyPassword } from "@/lib/company-accounts-crypto";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET() {
  try {
    const [{ data: companies, error: companiesError }, { data: accounts, error: accountsError }] = await Promise.all([
      client().from("companies").select("*").order("name"),
      client().from("company_accounts").select("id, company_id, platform_name, login, created_at, updated_at").order("platform_name"),
    ]);
    if (companiesError) throw companiesError;
    if (accountsError) throw accountsError;
    return NextResponse.json({ companies: companies ?? [], accounts: accounts ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load company accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const companyId = Number(body.company_id);
    const platformName = String(body.platform_name ?? "").trim();
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");

    if (!Number.isInteger(companyId) || companyId <= 0 || !platformName || !login || !password) {
      return NextResponse.json({ error: "Company, platform name, login, and password are required." }, { status: 400 });
    }

    const { data, error } = await client().from("company_accounts").insert({
      company_id: companyId,
      platform_name: platformName,
      login,
      encrypted_password: encryptCompanyPassword(password),
    }).select("id, company_id, platform_name, login, created_at, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ account: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create company account." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const platformName = String(body.platform_name ?? "").trim();
    const login = String(body.login ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !platformName || !login) {
      return NextResponse.json({ error: "A valid account, platform name, and login are required." }, { status: 400 });
    }

    const values: Record<string, string | number> = { platform_name: platformName, login, updated_at: new Date().toISOString() };
    const password = String(body.password ?? "");
    if (password) values.encrypted_password = encryptCompanyPassword(password);

    const { data, error } = await client().from("company_accounts").update(values).eq("id", id).select("id, company_id, platform_name, login, created_at, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ account: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update company account." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid account is required." }, { status: 400 });
    const { error } = await client().from("company_accounts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete company account." }, { status: 500 });
  }
}
