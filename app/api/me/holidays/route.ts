import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const client = await getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const month = new URL(request.url).searchParams.get("month") ?? "";
    let query = client
      .from("holidays")
      .select("id, title, start_date, end_date, created_at")
      .order("start_date", { ascending: true });
    if (/^\d{4}-\d{2}$/.test(month)) {
      const [year, monthNumber] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      query = query
        .lte("start_date", `${month}-${String(lastDay).padStart(2, "0")}`)
        .gte("end_date", `${month}-01`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ holidays: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load holidays.",
      },
      { status: 500 },
    );
  }
}
