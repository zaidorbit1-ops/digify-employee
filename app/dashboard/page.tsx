import { OverviewView } from "@/components/dashboard/overview";
import { EmployeeHome } from "@/components/dashboard/employee-home";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const client = await getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const { data: profile } = await client.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile?.role === "employee") return <EmployeeHome />;
  }
  return <OverviewView />;
}
