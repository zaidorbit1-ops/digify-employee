import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function getCrmAdminClient() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return { client, error: "Authentication required." } as const;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (profile?.role !== "superadmin" || profile.is_active === false) {
    return { client, error: "Superadmin access required." } as const;
  }

  return { client, error: null } as const;
}