import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

async function getAccessClient() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return { client, user: null, profile: null, error: "Authentication required." } as const;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile || profile.is_active === false) {
    return { client, user, profile: null, error: "Account access is not available." } as const;
  }

  if (profile.role === "superadmin") {
    return { client, user, profile, error: null } as const;
  }

  const { data: permissions, error: permissionError } = await client
    .from("permissions")
    .select("module, can_read, can_add, can_edit, can_delete")
    .eq("employee_id", profile.employee_id)
    .like("module", "crm_%");

  if (permissionError) throw permissionError;

  if (!permissions?.some((permission) => permission.can_read || permission.can_add || permission.can_edit || permission.can_delete)) {
    return { client, user, profile, error: "Business CRM access required." } as const;
  }

  return { client, user, profile, permission: permissions.find((permission) => permission.module === "crm_companies"), error: null } as const;
}

function responseForError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCompanyForm(form: FormData) {
  const name = cleanText(form.get("name"));
  const description = cleanText(form.get("description"));
  const websiteUrl = cleanText(form.get("website_url"));
  const websiteName = cleanText(form.get("website_name")) || "Primary website";
  const websiteTechnology = cleanText(form.get("website_technology")) || "other";
  const hostingProvider = cleanText(form.get("hosting_provider")) || "other";
  const status = cleanText(form.get("status")) || "active";
  const logoUrl = cleanText(form.get("logo_url"));

  if (!name) throw new Error("Company name is required.");
  if (!["active", "inactive", "archived"].includes(status)) {
    throw new Error("Choose a valid company status.");
  }
  if (websiteUrl) {
    try {
      new URL(websiteUrl);
    } catch {
      throw new Error("Website URL must be a valid URL.");
    }
  }
  if (logoUrl) {
    try {
      const parsedLogoUrl = new URL(logoUrl);
      if (!['http:', 'https:'].includes(parsedLogoUrl.protocol)) throw new Error();
    } catch {
      throw new Error("Logo URL must be a valid HTTP or HTTPS URL.");
    }
  }
  if (!["react", "nextjs", "php", "wordpress", "other"].includes(websiteTechnology)) throw new Error("Choose a valid website technology.");
  if (!["hostinger", "orangehost", "other"].includes(hostingProvider)) throw new Error("Choose a valid hosting provider.");

  const values: {
    name: string;
    description: string | null;
    logo_url: string | null;
    status: string;
  } = {
    name,
    description: description || null,
    logo_url: logoUrl || null,
    status,
  };
  return { values, websiteUrl, websiteName, websiteTechnology, hostingProvider };
}

export async function GET(request: Request) {
  try {
    const { client, profile, error: authError } = await getAccessClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const searchParams = new URL(request.url).searchParams;
    const idParam = searchParams.get("id");
    const requestedModule = searchParams.get("module");
    let query = client.from("crm_companies").select("*, crm_websites(*)").order("name");
    if (profile?.role === "employee" && profile.employee_id && requestedModule?.startsWith("crm_")) {
      const service = getSupabaseServiceRoleClient();
      const { data: access, error: accessError } = await service.from("employee_crm_module_company_access").select("company_id").eq("employee_id", profile.employee_id).eq("module", requestedModule);
      if (accessError) throw accessError;
      const companyIds = (access ?? []).map((item) => item.company_id);
      query = companyIds.length ? query.in("id", companyIds) : query.in("id", [-1]);
    }
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
      query = query.eq("id", id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ companies: data ?? [] });
  } catch (error) {
    return responseForError(error, "Could not load CRM companies.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, profile, permission, error: authError } = await getAccessClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (profile?.role !== "superadmin" && !permission?.can_add) {
      return NextResponse.json({ error: "You do not have permission to add CRM companies." }, { status: 403 });
    }
    const form = await request.formData();
    const companyForm = parseCompanyForm(form);
    const { data, error } = await client.from("crm_companies").insert(companyForm.values).select().single();
    if (error) throw error;
    if (companyForm.websiteUrl) {
      const { error: websiteError } = await client.from("crm_websites").insert({
        company_id: data.id,
        name: companyForm.websiteName,
        website_url: companyForm.websiteUrl,
        technology: companyForm.websiteTechnology,
        hosting_provider: companyForm.hostingProvider,
      });
      if (websiteError) throw websiteError;
    }
    return NextResponse.json({ company: data }, { status: 201 });
  } catch (error) {
    return responseForError(error, "Could not create CRM company.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, profile, permission, error: authError } = await getAccessClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (profile?.role !== "superadmin" && !permission?.can_edit) {
      return NextResponse.json({ error: "You do not have permission to edit CRM companies." }, { status: 403 });
    }
    const form = await request.formData();
    const id = Number(cleanText(form.get("id")));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    const companyForm = parseCompanyForm(form);
    const { data, error } = await client.from("crm_companies").update({ ...companyForm.values, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    const { data: existingWebsite, error: websiteLookupError } = await client.from("crm_websites").select("id").eq("company_id", id).order("id").limit(1).maybeSingle();
    if (websiteLookupError) throw websiteLookupError;
    if (companyForm.websiteUrl && existingWebsite) {
      const { error: websiteError } = await client.from("crm_websites").update({ name: companyForm.websiteName, website_url: companyForm.websiteUrl, technology: companyForm.websiteTechnology, hosting_provider: companyForm.hostingProvider, updated_at: new Date().toISOString() }).eq("id", existingWebsite.id);
      if (websiteError) throw websiteError;
    } else if (companyForm.websiteUrl) {
      const { error: websiteError } = await client.from("crm_websites").insert({ company_id: id, name: companyForm.websiteName, website_url: companyForm.websiteUrl, technology: companyForm.websiteTechnology, hosting_provider: companyForm.hostingProvider });
      if (websiteError) throw websiteError;
    } else if (existingWebsite) {
      const { error: websiteError } = await client.from("crm_websites").delete().eq("id", existingWebsite.id);
      if (websiteError) throw websiteError;
    }
    return NextResponse.json({ company: data });
  } catch (error) {
    return responseForError(error, "Could not update CRM company.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, profile, permission, error: authError } = await getAccessClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (profile?.role !== "superadmin" && !permission?.can_delete) {
      return NextResponse.json({ error: "You do not have permission to delete CRM companies." }, { status: 403 });
    }
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    const { error } = await client.from("crm_companies").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseForError(error, "Could not delete CRM company.");
  }
}