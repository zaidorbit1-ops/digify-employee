import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function getCrmAdminClient() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return { client, error: "Authentication required." } as const;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (profile?.is_active === false) {
    return { client, error: "Superadmin access required." } as const;
  }

  if (profile?.role === "employee" && profile.employee_id) {
    const { data: permissions, error: permissionError } = await client
      .from("permissions")
      .select("module, can_read, can_add, can_edit, can_delete")
      .eq("employee_id", profile.employee_id)
      .like("module", "crm_%");
    if (permissionError) throw permissionError;
    if (!permissions?.some((permission) => permission.can_read || permission.can_add || permission.can_edit || permission.can_delete)) {
      return { client, error: "Business CRM access required." } as const;
    }
    return { client, error: null, profile, permissions } as const;
  }

  if (profile?.role !== "superadmin") return { client, error: "Superadmin access required." } as const;

  return { client, error: null, profile } as const;
}

export async function getCrmAdminContext() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return { client, user: null, error: "Authentication required." } as const;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, employee_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (profile?.is_active === false) {
    return { client, user: null, error: "Superadmin access required." } as const;
  }

  if (profile?.role === "employee" && profile.employee_id) {
    const { data: permissions, error: permissionError } = await client
      .from("permissions")
      .select("module, can_read, can_add, can_edit, can_delete")
      .eq("employee_id", profile.employee_id)
      .like("module", "crm_%");
    if (permissionError) throw permissionError;
    if (!permissions?.some((permission) => permission.can_read || permission.can_add || permission.can_edit || permission.can_delete)) {
      return { client, user: null, error: "Business CRM access required." } as const;
    }
    return { client, user, profile, permissions, error: null } as const;
  }

  if (profile?.role !== "superadmin") {
    return { client, user: null, error: "Superadmin access required." } as const;
  }

  return { client, user, profile, error: null } as const;
}