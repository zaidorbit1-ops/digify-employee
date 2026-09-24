import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
