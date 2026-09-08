import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const range = monthRange(month);
    let expensesQuery = client().from("expenses").select("*").order("expense_date", { ascending: false });
    let revenuesQuery = client().from("revenues").select("*").order("revenue_date", { ascending: false });
    if (range) {
      expensesQuery = expensesQuery.gte("expense_date", range.start).lte("expense_date", range.end);
      revenuesQuery = revenuesQuery.gte("revenue_date", range.start).lte("revenue_date", range.end);
    }

    const [{ data: expenses, error: expensesError }, { data: revenues, error: revenuesError }] = await Promise.all([expensesQuery, revenuesQuery]);
    if (expensesError) throw expensesError;
    if (revenuesError) throw revenuesError;
    const safeExpenses = expenses ?? [];
    const safeRevenues = revenues ?? [];
    const totalExpenses = safeExpenses.reduce((total, item) => total + Number(item.amount ?? 0), 0);
    const totalRevenue = safeRevenues.reduce((total, item) => total + Number(item.amount ?? 0), 0);
    return NextResponse.json({ expenses: safeExpenses, revenues: safeRevenues, summary: { total_expenses: totalExpenses, total_revenue: totalRevenue, net: totalRevenue - totalExpenses } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load payment tracking." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === "revenue" ? "revenue" : "expense";
    const amount = Number(body.amount);
    const description = String(body.description ?? "").trim();
    const date = String(body.date ?? "").trim();
    if (!Number.isFinite(amount) || amount < 0 || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Enter a valid amount, description, and date." }, { status: 400 });
    }

    const { data, error } = type === "revenue"
      ? await client().from("revenues").insert({ amount, description, revenue_date: date }).select().single()
      : await client().from("expenses").insert({ source: "manual", amount, description, expense_date: date }).select().single();
    if (error) throw error;
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add transaction." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const type = body.type === "revenue" ? "revenue" : "expense";
    const id = Number(body.id);
    const amount = Number(body.amount);
    const description = String(body.description ?? "").trim();
    const date = String(body.date ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(amount) || amount < 0 || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Enter valid transaction details." }, { status: 400 });
    }
    if (type === "expense") {
      const { data, error } = await client().from("expenses").update({ amount, description, expense_date: date }).eq("id", id).eq("source", "manual").select().single();
      if (error) throw error;
      return NextResponse.json({ entry: data });
    }
    const { data, error } = await client().from("revenues").update({ amount, description, revenue_date: date }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update transaction." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") === "revenue" ? "revenue" : "expense";
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid transaction is required." }, { status: 400 });
    const query = type === "revenue"
      ? client().from("revenues").delete().eq("id", id)
      : client().from("expenses").delete().eq("id", id).eq("source", "manual");
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete transaction." }, { status: 500 });
  }
}
