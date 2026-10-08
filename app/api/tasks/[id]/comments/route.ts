import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const maxCommentLength = 5000;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Could not process task comments.";
}

async function getAuthorizedTask(taskId: number, userId: string) {
  const client = getSupabaseServiceRoleClient();
  const { data: task, error } = await client
    .from("tasks")
    .select("id, creator_user_id, assignee_user_id")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;
  if (!task) return { client, task: null };
  if (task.creator_user_id !== userId && task.assignee_user_id !== userId) {
    return { client, task: null };
  }
  return { client, task };
}

async function authenticate() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticate();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { id: rawId } = await params;
    const taskId = Number(rawId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });
    }

    const { client, task } = await getAuthorizedTask(taskId, user.id);
    if (!task) return NextResponse.json({ error: "You do not have access to these task comments." }, { status: 404 });

    const { data: comments, error } = await client
      .from("task_comments")
      .select("id, author_user_id, body, created_at, updated_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const authorIds = [...new Set((comments ?? []).map((comment) => comment.author_user_id))];
    const { data: profiles, error: profileError } = authorIds.length
      ? await client.from("profiles").select("user_id, full_name").in("user_id", authorIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const authorNames = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name]));

    return NextResponse.json({
      comments: (comments ?? []).map((comment) => ({
        ...comment,
        author_name: authorNames.get(comment.author_user_id) ?? "Team member",
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticate();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { id: rawId } = await params;
    const taskId = Number(rawId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });
    }

    const body = await request.json();
    const commentBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!commentBody) return NextResponse.json({ error: "Write a comment before posting." }, { status: 400 });
    if (commentBody.length > maxCommentLength) {
      return NextResponse.json({ error: `Comments must be ${maxCommentLength} characters or fewer.` }, { status: 400 });
    }

    const { client, task } = await getAuthorizedTask(taskId, user.id);
    if (!task) return NextResponse.json({ error: "You do not have access to comment on this task." }, { status: 403 });

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: comment, error } = await client
      .from("task_comments")
      .insert({ task_id: taskId, author_user_id: user.id, body: commentBody })
      .select("id, author_user_id, body, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      comment: { ...comment, author_name: profile?.full_name ?? "Team member" },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
