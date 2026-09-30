import { NextResponse } from "next/server";
import { decryptCompanyPassword, encryptCompanyPassword } from "@/lib/company-accounts-crypto";
import { canAccessCompany, getCompanyAccessContext } from "@/lib/company-access";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET(request: Request) {
  try {
    const access = await getCompanyAccessContext();
    if (!access) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const searchQuery = new URL(request.url).searchParams.get("search")?.trim().toLowerCase() ?? "";
    const [{ data: companies, error: companiesError }, { data: accounts, error: accountsError }] = await Promise.all([
      client().from("companies").select("*").order("name"),
      client().from("company_accounts").select("id, company_id, platform_name, login, encrypted_password, created_at, updated_at").order("platform_name"),
    ]);
    if (companiesError) throw companiesError;
    if (accountsError) throw accountsError;
    const visibleCompanies = access.isSuperadmin ? companies ?? [] : (companies ?? []).filter((company) => access.allowedCompanyIds.includes(company.id));
    const visibleCompanyIds = new Set(visibleCompanies.map((company) => company.id));
    const visibleAccounts = (accounts ?? []).filter((account) => visibleCompanyIds.has(account.company_id));
    if (searchQuery.length >= 2) {
      const companyNames = new Map(visibleCompanies.map((company) => [company.id, company.name]));
      const results = visibleAccounts
        .filter((account) => `${companyNames.get(account.company_id) ?? ""} ${account.platform_name} ${account.login}`.toLowerCase().includes(searchQuery))
        .slice(0, 100)
        .map((account) => ({
          id: account.id,
          company_id: account.company_id,
          company_name: companyNames.get(account.company_id) ?? "Company",
          platform_name: account.platform_name,
          login: account.login,
          password: decryptCompanyPassword(String(account.encrypted_password)),
        }));
      return NextResponse.json({ results });
    }
    return NextResponse.json({ companies: visibleCompanies, accounts: visibleAccounts.map(({ encrypted_password: _encryptedPassword, ...account }) => account) });
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
    if (!(await canAccessCompany(companyId))) return NextResponse.json({ error: "You do not have access to this company." }, { status: 403 });

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
    const { data: existingAccount, error: existingError } = await client().from("company_accounts").select("company_id").eq("id", id).single();
    if (existingError) throw existingError;
    if (!(await canAccessCompany(existingAccount.company_id))) return NextResponse.json({ error: "You do not have access to this company." }, { status: 403 });
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
    const { data: existingAccount, error: existingError } = await client().from("company_accounts").select("company_id").eq("id", id).single();
    if (existingError) throw existingError;
    if (!(await canAccessCompany(existingAccount.company_id))) return NextResponse.json({ error: "You do not have access to this company." }, { status: 403 });
    const { error } = await client().from("company_accounts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete company account." }, { status: 500 });
  }
}
