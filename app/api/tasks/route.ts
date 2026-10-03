import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const validStatuses = new Set(["todo", "in_progress", "approved", "done"]);
const validPriorities = new Set(["low", "medium", "high", "urgent"]);

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const details = error as { message?: string; code?: string; details?: string };
    return `${details.message ?? fallback}${details.code ? ` (code ${details.code})` : ""}${details.details ? ` ${details.details}` : ""}`;
  }
  return fallback;
}

function parseNullableDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function getUserContext() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  const client = getSupabaseServiceRoleClient();
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, profile, client };
}

async function getTaskForUser(client: ReturnType<typeof getSupabaseServiceRoleClient>, userId: string, taskId: number) {
  const { data: task, error } = await client
    .from("tasks")
    .select("id, title, creator_user_id, assignee_user_id, status, priority, due_at")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;
  if (!task || (task.creator_user_id !== userId && task.assignee_user_id !== userId)) return null;
  return task;
}

export async function GET(request: Request) {
  try {
    const { user, client } = await getUserContext();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const query = searchParams.get("q")?.trim() ?? "";

    let requestQuery = client
      .from("tasks")
      .select(
        "id, title, description, status, priority, creator_user_id, assignee_user_id, due_at, start_at, reminder_at, created_at, updated_at, completed_at, archived_at, order_index",
      )
      .is("archived_at", null)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: false });

    requestQuery = requestQuery.or(`creator_user_id.eq.${user.id},assignee_user_id.eq.${user.id}`);
    if (status && validStatuses.has(status)) {
      requestQuery = requestQuery.eq("status", status);
    }

    const { data, error } = await requestQuery;
    if (error) throw error;

    const tasks = (data ?? []).filter((task) => {
      if (!query) return true;
      const haystack = `${task.title ?? ""} ${task.description ?? ""}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
    const userIds = [...new Set(tasks.flatMap((task) => [
      task.creator_user_id,
      task.assignee_user_id,
    ].filter((id): id is string => Boolean(id))))];
    const { data: profiles, error: profilesError } = userIds.length
      ? await client.from("profiles").select("user_id, full_name").in("user_id", userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const names = new Map((profiles ?? []).map((item) => [item.user_id, item.full_name]));
    const normalized = tasks.map((task) => ({
      ...task,
      creator_name: names.get(task.creator_user_id) ?? null,
      assignee_name: task.assignee_user_id ? names.get(task.assignee_user_id) ?? null : null,
    }));

    return NextResponse.json({ tasks: normalized });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load tasks.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, profile, client } = await getUserContext();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const status = String(body.status ?? "todo");
    const priority = String(body.priority ?? "medium");
    const dueAt = parseNullableDate(body.due_at);
    const startAt = parseNullableDate(body.start_at);
    const reminderAt = parseNullableDate(body.reminder_at);
    const assigneeUserId = typeof body.assignee_user_id === "string" ? body.assignee_user_id : null;

    if (!title) return NextResponse.json({ error: "A task title is required." }, { status: 400 });
    if (!validStatuses.has(status)) return NextResponse.json({ error: "Unsupported task status." }, { status: 400 });
    if (!validPriorities.has(priority)) return NextResponse.json({ error: "Unsupported task priority." }, { status: 400 });
    if (assigneeUserId && profile?.role !== "admin" && profile?.role !== "superadmin") {
      return NextResponse.json({ error: "Only admins can assign tasks." }, { status: 403 });
    }
    if (assigneeUserId) {
      const { data: assignee, error: assigneeError } = await client
        .from("profiles")
        .select("user_id, role, is_active")
        .eq("user_id", assigneeUserId)
        .maybeSingle();
      if (assigneeError) throw assigneeError;
      if (!assignee || assignee.role !== "employee" || assignee.is_active === false) {
        return NextResponse.json({ error: "Choose an active employee to assign this task." }, { status: 400 });
      }
    }

    const { data, error } = await client
      .from("tasks")
      .insert({
        title,
        description: String(body.description ?? "").trim() || null,
        status,
        priority,
        creator_user_id: user.id,
        assignee_user_id: assigneeUserId,
        due_at: dueAt,
        start_at: startAt,
        reminder_at: reminderAt,
      })
      .select("id, title, description, status, priority, creator_user_id, assignee_user_id, due_at, start_at, reminder_at, created_at, updated_at, completed_at, archived_at, order_index")
      .single();

    if (error) throw error;

    const { error: activityError } = await client.from("task_activity").insert({
      task_id: data.id,
      actor_user_id: user.id,
      action: "task_created",
      details: { title, status, priority, assignee_user_id: assigneeUserId },
    });
    if (activityError) throw activityError;

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not create task.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, profile, client } = await getUserContext();
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });

    const task = await getTaskForUser(client, user.id, id);
    if (!task) return NextResponse.json({ error: "You do not have permission to edit this task." }, { status: 403 });
    const isCreator = task.creator_user_id === user.id;
    const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
    const nonStatusFields = ["title", "description", "priority", "due_at", "start_at", "reminder_at", "assignee_user_id", "order_index"];
    if (!isCreator && nonStatusFields.some((field) => body[field] !== undefined)) {
      return NextResponse.json({ error: "Only the task creator can edit task details." }, { status: 403 });
    }

    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) {
      const title = String(body.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "A task title is required." }, { status: 400 });
      values.title = title;
    }
    if (body.description !== undefined) values.description = String(body.description ?? "").trim() || null;
    if (body.status !== undefined) {
      const status = String(body.status ?? "todo");
      if (!validStatuses.has(status)) return NextResponse.json({ error: "Unsupported task status." }, { status: 400 });
      values.status = status;
      if (status === "done") values.completed_at = new Date().toISOString();
      else if (status === "todo" || status === "in_progress" || status === "approved") values.completed_at = null;
    }
    if (body.priority !== undefined) {
      const priority = String(body.priority ?? "medium");
      if (!validPriorities.has(priority)) return NextResponse.json({ error: "Unsupported task priority." }, { status: 400 });
      values.priority = priority;
    }
    if (body.due_at !== undefined) values.due_at = parseNullableDate(body.due_at);
    if (body.start_at !== undefined) values.start_at = parseNullableDate(body.start_at);
    if (body.reminder_at !== undefined) values.reminder_at = parseNullableDate(body.reminder_at);
    if (body.assignee_user_id !== undefined) {
      if (!isAdmin) return NextResponse.json({ error: "Only admins can assign tasks." }, { status: 403 });
      const assigneeUserId = typeof body.assignee_user_id === "string" && body.assignee_user_id ? body.assignee_user_id : null;
      if (assigneeUserId) {
        const { data: assignee, error: assigneeError } = await client
          .from("profiles")
          .select("user_id, role, is_active")
          .eq("user_id", assigneeUserId)
          .maybeSingle();
        if (assigneeError) throw assigneeError;
        if (!assignee || assignee.role !== "employee" || assignee.is_active === false) {
          return NextResponse.json({ error: "Choose an active employee to assign this task." }, { status: 400 });
        }
      }
      values.assignee_user_id = assigneeUserId;
    }
    if (body.order_index !== undefined) values.order_index = Number(body.order_index ?? 0);

    const { data, error } = await client
      .from("tasks")
      .update(values)
      .eq("id", id)
      .select("id, title, description, status, priority, creator_user_id, assignee_user_id, due_at, start_at, reminder_at, created_at, updated_at, completed_at, archived_at, order_index")
      .single();

    if (error) throw error;

    const { error: activityError } = await client.from("task_activity").insert({
      task_id: data.id,
      actor_user_id: user.id,
      action: "task_updated",
      details: {
        changes: values,
        previous: {
          title: task.title,
          status: task.status,
          priority: task.priority,
          due_at: task.due_at,
          assignee_user_id: task.assignee_user_id,
        },
      },
    });
    if (activityError) throw activityError;

    return NextResponse.json({ task: data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update task.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, profile, client } = await getUserContext();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });

    const task = await getTaskForUser(client, user.id, id);
    if (!task || (task.creator_user_id !== user.id && profile?.role !== "admin" && profile?.role !== "superadmin")) {
      return NextResponse.json({ error: "You do not have permission to archive this task." }, { status: 403 });
    }

    const { error } = await client
      .from("tasks")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    const { error: activityError } = await client.from("task_activity").insert({
      task_id: id,
      actor_user_id: user.id,
      action: "task_archived",
      details: { archived: true },
    });
    if (activityError) throw activityError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not archive task.") }, { status: 500 });
  }
}
