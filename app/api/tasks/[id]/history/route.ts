import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load task history.";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionClient = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id: rawId } = await params;
    const taskId = Number(rawId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });
    }

    const client = getSupabaseServiceRoleClient();
    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("id, creator_user_id, assignee_user_id")
      .eq("id", taskId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return NextResponse.json({ error: "Task was not found." }, { status: 404 });
    if (task.creator_user_id !== user.id && task.assignee_user_id !== user.id) {
      return NextResponse.json({ error: "You do not have access to this task history." }, { status: 403 });
    }

    const { data: activity, error: activityError } = await client
      .from("task_activity")
      .select("id, actor_user_id, action, details, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (activityError) throw activityError;

    const relatedUserIds = (activity ?? []).flatMap((entry) => {
      const details = entry.details as Record<string, unknown>;
      const changes = details.changes as Record<string, unknown> | undefined;
      return [details.assignee_user_id, changes?.assignee_user_id]
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    });
    const userIds = [...new Set([...(activity ?? []).map((entry) => entry.actor_user_id), ...relatedUserIds])];
    const { data: profiles, error: profilesError } = userIds.length
      ? await client.from("profiles").select("user_id, full_name").in("user_id", userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;
    const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name]));

    return NextResponse.json({
      history: (activity ?? []).map((entry) => ({
        ...entry,
        actor_name: names.get(entry.actor_user_id) ?? "Team member",
        assignee_names: Object.fromEntries(relatedUserIds.map((id) => [id, names.get(id) ?? "Employee"])),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
