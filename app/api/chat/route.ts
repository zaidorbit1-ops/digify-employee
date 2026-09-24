import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const details = error as { message?: string; code?: string; details?: string };
    return `${details.message ?? fallback}${details.code ? ` (code ${details.code})` : ""}${details.details ? ` ${details.details}` : ""}`;
  }
  return fallback;
}

function toTime(value: string | null | undefined) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function computeUnreadCount(
  messages: Array<{ conversation_id: string; sender_user_id: string; created_at: string }>,
  lastReadAt: string | null,
  conversationId: string,
  userId: string,
) {
  const relevant = messages.filter(
    (message) => String(message.conversation_id) === String(conversationId) && message.sender_user_id !== userId,
  );

  if (!lastReadAt) return relevant.length;
  const cutoff = new Date(lastReadAt).getTime();
  return relevant.filter((message) => new Date(message.created_at).getTime() > cutoff).length;
}

function isMissingReadColumn(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const details = error as { code?: string; message?: string; details?: string };
  const text = `${details.message ?? ""} ${details.details ?? ""}`.toLowerCase();
  return details.code === "42703"
    || details.code === "PGRST204"
    || text.includes("last_read_at") && text.includes("column");
}

function isMissingAttachmentsTable(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const details = error as { code?: string; message?: string; details?: string };
  const text = `${details.message ?? ""} ${details.details ?? ""}`.toLowerCase();
  return details.code === "42P01"
    || details.code === "PGRST205"
    || text.includes("chat_attachments") && text.includes("not found");
}

async function getCurrentEmployee() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  const serviceClient = getSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("user_id, employee_id, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  return {
    client: serviceClient,
    user,
    employeeId: profile?.employee_id ?? null,
    profile: profile ?? {
      user_id: user.id,
      employee_id: null,
      full_name: user.email ?? "User",
      role: "employee",
    },
  };
}

async function getParticipantDisplayName(client: ReturnType<typeof getSupabaseServiceRoleClient>, userId: string, fallbackEmployeeId: number | null) {
  const { data: profile } = await client
    .from("profiles")
    .select("full_name, employee_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.full_name) return profile.full_name;

  if (fallbackEmployeeId) {
    const { data: employee } = await client
      .from("employees")
      .select("name")
      .eq("id", fallbackEmployeeId)
      .maybeSingle();

    if (employee?.name) return employee.name;
  }

  return "Employee";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const conversationId = searchParams.get("conversation_id");
    const { client, user, employeeId, profile } = await getCurrentEmployee();

    if (action === "participants") {
      const { data: profileRows, error: profileError } = await client
        .from("profiles")
        .select("user_id, employee_id, full_name, role")
        .neq("user_id", user.id)
        .order("full_name", { ascending: true });

      if (profileError) throw profileError;

      const { data: employeeRows, error: employeeError } = await client
        .from("employees")
        .select("id, name, auth_user_id")
        .order("name", { ascending: true });

      if (employeeError) throw employeeError;

      const participantMap = new Map<string, {
        id: string;
        user_id: string;
        employee_id: number | null;
        name: string;
        role: string;
      }>();

      for (const profile of profileRows ?? []) {
        participantMap.set(String(profile.user_id), {
          id: String(profile.user_id),
          user_id: String(profile.user_id),
          employee_id: profile.employee_id ?? null,
          name: profile.full_name || "Employee",
          role: profile.role || "employee",
        });
      }

      for (const employee of employeeRows ?? []) {
        if (!employee.auth_user_id) continue;
        if (participantMap.has(employee.auth_user_id)) continue;
        participantMap.set(employee.auth_user_id, {
          id: employee.auth_user_id,
          user_id: employee.auth_user_id,
          employee_id: employee.id,
          name: employee.name || "Employee",
          role: "employee",
        });
      }

      return NextResponse.json({
        participants: [...participantMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
      });
    }

    if (conversationId) {
      let { data: membership, error: membershipError } = await client
        .from("conversation_members")
        .select("conversation_id, last_read_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError && isMissingReadColumn(membershipError)) {
        const fallback = await client
          .from("conversation_members")
          .select("conversation_id")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle();
        membership = fallback.data ? { ...fallback.data, last_read_at: null } : null;
        membershipError = fallback.error;
      }
      if (membershipError) throw membershipError;
      if (!membership) {
        return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
      }

      const { data: messages, error: messagesError } = await client
        .from("chat_messages")
        .select("id, conversation_id, body, created_at, sender_user_id, sender_employee_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      const messageIds = (messages ?? []).map((message) => message.id);
      const { data: attachments, error: attachmentsError } = messageIds.length
        ? await client
            .from("chat_attachments")
            .select("id, message_id, file_name, file_path, file_type, file_size")
            .in("message_id", messageIds)
        : { data: [], error: null };
      if (attachmentsError && !isMissingAttachmentsTable(attachmentsError)) throw attachmentsError;

      const attachmentMap = new Map<string, {
        id: string;
        name: string;
        path: string;
        type: string;
        size: number;
      }>();
      for (const attachment of attachments ?? []) {
        attachmentMap.set(String(attachment.message_id), {
          id: String(attachment.id),
          name: attachment.file_name,
          path: attachment.file_path,
          type: attachment.file_type,
          size: Number(attachment.file_size),
        });
      }

      let { data: readMembers, error: readMembersError } = await client
        .from("conversation_members")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId);
      if (readMembersError && isMissingReadColumn(readMembersError)) {
        const fallback = await client
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", conversationId);
        readMembers = (fallback.data ?? []).map((member) => ({ ...member, last_read_at: null }));
        readMembersError = fallback.error;
      }
      if (readMembersError) throw readMembersError;
      const otherReadTimes = (readMembers ?? [])
        .filter((member) => member.user_id !== user.id && member.last_read_at)
        .map((member) => new Date(member.last_read_at as string).getTime());

      const userNames = new Map<string, string>();
      const senderUserIds = [...new Set((messages ?? []).map((message) => message.sender_user_id).filter((id): id is string => Boolean(id)))];
      if (senderUserIds.length) {
        const { data: profileRows } = await client
          .from("profiles")
          .select("user_id, full_name, employee_id")
          .in("user_id", senderUserIds);

        const { data: employeeRows } = await client
          .from("employees")
          .select("id, name, auth_user_id")
          .in("auth_user_id", senderUserIds);

        for (const profile of profileRows ?? []) {
          userNames.set(profile.user_id, profile.full_name || "Employee");
        }
        for (const employee of employeeRows ?? []) {
          if (employee.auth_user_id) userNames.set(employee.auth_user_id, employee.name || "Employee");
        }
      }

      const readUpdate = await client
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (readUpdate.error && !isMissingReadColumn(readUpdate.error)) throw readUpdate.error;

      return NextResponse.json({
        messages: (messages ?? []).map((message) => ({
          id: message.id,
          sender: message.sender_user_id === user.id ? "me" : "them",
          text: message.body,
          time: toTime(message.created_at),
          senderName: userNames.get(message.sender_user_id) ?? "Employee",
          seen: message.sender_user_id === user.id && otherReadTimes.some((readAt) => readAt >= new Date(message.created_at).getTime()),
          attachment: attachmentMap.get(String(message.id)) ?? null,
        })),
      });
    }

    let { data: memberships, error: membershipsError } = await client
      .from("conversation_members")
      .select("conversation_id, user_id, employee_id, last_read_at, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });

    if (membershipsError && isMissingReadColumn(membershipsError)) {
      const fallback = await client
        .from("conversation_members")
        .select("conversation_id, user_id, employee_id, joined_at")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      memberships = (fallback.data ?? []).map((membership) => ({ ...membership, last_read_at: null }));
      membershipsError = fallback.error;
    }
    if (membershipsError) throw membershipsError;
    const ids = [...new Set((memberships ?? []).map((item) => item.conversation_id))];

    if (!ids.length) {
      return NextResponse.json({ conversations: [] });
    }

    const { data: conversations, error: conversationsError } = await client
      .from("conversations")
      .select("id, type, title, updated_at")
      .in("id", ids)
      .order("updated_at", { ascending: false });

    if (conversationsError) throw conversationsError;

    const { data: members, error: membersError } = await client
      .from("conversation_members")
      .select("conversation_id, user_id, employee_id")
      .in("conversation_id", ids);

    if (membersError) throw membersError;

    const memberUserIds = [...new Set((members ?? []).map((member) => member.user_id).filter(Boolean))];
    const memberEmployeeIds = [...new Set((members ?? []).map((member) => member.employee_id).filter((id): id is number => id !== null))];

    const { data: profileRows } = memberUserIds.length
      ? await client.from("profiles").select("user_id, full_name, employee_id, role").in("user_id", memberUserIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null; employee_id: number | null; role: string | null }> };
    const { data: employeeRows } = memberEmployeeIds.length
      ? await client.from("employees").select("id, name").in("id", memberEmployeeIds)
      : { data: [] as Array<{ id: number; name: string | null }> };

    const profileNameMap = new Map<string, string>();
    for (const profile of profileRows ?? []) {
      profileNameMap.set(profile.user_id, profile.full_name || "Employee");
    }
    const employeeNameMap = new Map<number, string>();
    for (const employee of employeeRows ?? []) {
      employeeNameMap.set(employee.id, employee.name ?? "Employee");
    }

    const lastReadByConversation = new Map<string, string | null>();
    for (const membership of memberships ?? []) {
      lastReadByConversation.set(String(membership.conversation_id), membership.last_read_at ?? null);
    }

    const { data: messages, error: messagesError } = await client
      .from("chat_messages")
      .select("conversation_id, body, created_at, sender_user_id")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    if (messagesError) throw messagesError;

    const memberMap = new Map<string, Array<{ user_id: string | null; employee_id: number | null; name: string }>>();
    for (const item of members ?? []) {
      const id = String(item.conversation_id);
      const key = memberMap.get(id) ?? [];
      const displayName = item.user_id ? profileNameMap.get(item.user_id) ?? employeeNameMap.get(item.employee_id ?? -1) ?? "Employee" : employeeNameMap.get(item.employee_id ?? -1) ?? "Employee";
      key.push({ user_id: item.user_id, employee_id: item.employee_id, name: displayName });
      memberMap.set(id, key);
    }

    const messageMap = new Map<string, { body: string; created_at: string }>();
    for (const message of messages ?? []) {
      const conversationIdValue = String(message.conversation_id);
      if (!messageMap.has(conversationIdValue)) {
        messageMap.set(conversationIdValue, {
          body: message.body,
          created_at: message.created_at,
        });
      }
    }

    const seenDirectMessagePairs = new Set<string>();
    const conversationRows = (conversations ?? []).flatMap((conversation) => {
      const conversationKey = String(conversation.id);
      const conversationMembers = memberMap.get(conversationKey) ?? [];
      const lastMessage = messageMap.get(conversationKey);
      const otherMember = conversationMembers.find((member) => member.user_id !== user.id && member.employee_id !== employeeId);
      const title = conversation.type === "dm"
        ? otherMember?.name || conversation.title || "Direct message"
        : conversation.title || otherMember?.name || "Conversation";

      if (conversation.type === "dm") {
        const pair = [...conversationMembers]
          .map((member) => String(member.user_id ?? member.employee_id ?? "unknown"))
          .sort()
          .join(":");
        if (seenDirectMessagePairs.has(pair)) return [];
        seenDirectMessagePairs.add(pair);
      }

      const unread = computeUnreadCount(
        (messages ?? []) as Array<{ conversation_id: string; sender_user_id: string; created_at: string }>,
        lastReadByConversation.get(conversationKey) ?? null,
        conversationKey,
        user.id,
      );

      return [{
        id: String(conversation.id),
        type: conversation.type,
        name: title,
        preview: lastMessage?.body ?? "No messages yet",
        time: lastMessage ? toTime(lastMessage.created_at) : "Now",
        unread,
        online: false,
        accent: "bg-rose-100 text-rose-600",
        members: conversationMembers,
      }];
    });

    return NextResponse.json({ conversations: conversationRows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load chat.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action ?? "send");
    const { client, user, employeeId, profile } = await getCurrentEmployee();

    if (action === "create_dm") {
      const participantUserId = String(body?.participant_user_id ?? "").trim();
      const participantEmployeeId = Number(body?.participant_employee_id ?? 0);

      let targetUserId = participantUserId;
      let targetEmployeeId: number | null = participantEmployeeId || null;

      if (!targetUserId && targetEmployeeId) {
        const { data: targetEmployee } = await client
          .from("employees")
          .select("id, auth_user_id")
          .eq("id", targetEmployeeId)
          .maybeSingle();
        targetUserId = targetEmployee?.auth_user_id ?? "";
      }

      if (!targetUserId || targetUserId === user.id) {
        return NextResponse.json({ error: "Choose another person to start a direct message." }, { status: 400 });
      }

      if (!targetEmployeeId) {
        const { data: targetProfile } = await client
          .from("profiles")
          .select("user_id, employee_id")
          .eq("user_id", targetUserId)
          .maybeSingle();
        targetEmployeeId = targetProfile?.employee_id ?? null;
      }

      const { data: currentMemberships, error: currentMembershipError } = await client
        .from("conversation_members")
        .select("conversation_id, user_id")
        .eq("user_id", user.id);

      if (currentMembershipError) throw currentMembershipError;

      const currentConversationIds = (currentMemberships ?? []).map((item) => item.conversation_id);
      if (currentConversationIds.length) {
        const { data: candidateRows, error: candidateError } = await client
          .from("conversation_members")
          .select("conversation_id, user_id")
          .in("conversation_id", currentConversationIds)
          .eq("user_id", targetUserId);

        if (candidateError) throw candidateError;

        if ((candidateRows ?? []).length) {
          return NextResponse.json({ conversation: { id: candidateRows[0].conversation_id } }, { status: 200 });
        }
      }

      const { data: createdConversation, error: createConversationError } = await client
        .from("conversations")
        .insert({ type: "dm", title: null })
        .select("id")
        .single();

      if (createConversationError) throw createConversationError;

      const { error: memberError } = await client.from("conversation_members").insert([
        { conversation_id: createdConversation.id, user_id: user.id, employee_id: employeeId },
        { conversation_id: createdConversation.id, user_id: targetUserId, employee_id: targetEmployeeId },
      ]);

      if (memberError) throw memberError;

      return NextResponse.json({ conversation: { id: createdConversation.id } }, { status: 201 });
    }

    if (action === "create_group") {
      if (profile.role !== "superadmin") {
        return NextResponse.json({ error: "Only an administrator can create groups." }, { status: 403 });
      }

      const title = String(body?.title ?? "").trim();
      const requestedUserIds = Array.isArray(body?.member_user_ids)
        ? body.member_user_ids.map((id: unknown) => String(id).trim()).filter(Boolean)
        : [];
      const memberUserIds = [...new Set([user.id, ...requestedUserIds])];
      if (!title || title.length > 80) {
        return NextResponse.json({ error: "Enter a group name between 1 and 80 characters." }, { status: 400 });
      }

      const { data: targetProfiles, error: targetProfilesError } = await client
        .from("profiles")
        .select("user_id, employee_id")
        .in("user_id", memberUserIds);
      if (targetProfilesError) throw targetProfilesError;
      const profileMap = new Map((targetProfiles ?? []).map((target) => [String(target.user_id), target]));
      if (memberUserIds.some((memberUserId) => !profileMap.has(memberUserId))) {
        return NextResponse.json({ error: "One or more selected members are not available." }, { status: 400 });
      }

      const { data: createdConversation, error: createConversationError } = await client
        .from("conversations")
        .insert({ type: "group", title, created_by: user.id })
        .select("id")
        .single();
      if (createConversationError) throw createConversationError;

      const { error: memberError } = await client.from("conversation_members").insert(
        memberUserIds.map((memberUserId) => ({
          conversation_id: createdConversation.id,
          user_id: memberUserId,
          employee_id: profileMap.get(memberUserId)?.employee_id ?? null,
          is_admin: memberUserId === user.id,
        })),
      );
      if (memberError) throw memberError;

      return NextResponse.json({ conversation: { id: createdConversation.id, type: "group", title } }, { status: 201 });
    }

    if (action === "manage_group") {
      if (profile.role !== "superadmin") {
        return NextResponse.json({ error: "Only an administrator can manage groups." }, { status: 403 });
      }
      const conversationId = String(body?.conversation_id ?? "").trim();
      const operation = String(body?.operation ?? "");
      if (!conversationId || !["add_members", "remove_member", "delete_group"].includes(operation)) {
        return NextResponse.json({ error: "A valid group action is required." }, { status: 400 });
      }

      const { data: group, error: groupError } = await client
        .from("conversations")
        .select("id, type")
        .eq("id", conversationId)
        .maybeSingle();
      if (groupError) throw groupError;
      if (!group || group.type !== "group") return NextResponse.json({ error: "Group not found." }, { status: 404 });

      if (operation === "delete_group") {
        const { error: deleteError } = await client.from("conversations").delete().eq("id", conversationId);
        if (deleteError) throw deleteError;
        return NextResponse.json({ deleted: true });
      }

      if (operation === "remove_member") {
        const memberUserId = String(body?.member_user_id ?? "").trim();
        if (!memberUserId || memberUserId === user.id) return NextResponse.json({ error: "The group administrator cannot remove themselves." }, { status: 400 });
        const { error: removeError } = await client
          .from("conversation_members")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", memberUserId);
        if (removeError) throw removeError;
        return NextResponse.json({ removed: true });
      }

      const memberUserIds = Array.isArray(body?.member_user_ids)
        ? [...new Set(body.member_user_ids.map((id: unknown) => String(id).trim()).filter(Boolean))] as string[]
        : [];
      if (!memberUserIds.length) return NextResponse.json({ error: "Choose at least one member." }, { status: 400 });
      const { data: memberProfiles, error: memberProfilesError } = await client
        .from("profiles")
        .select("user_id, employee_id")
        .in("user_id", memberUserIds);
      if (memberProfilesError) throw memberProfilesError;
      const profileMap = new Map((memberProfiles ?? []).map((member) => [String(member.user_id), member]));
      if (memberUserIds.some((memberUserId) => !profileMap.has(memberUserId))) return NextResponse.json({ error: "One or more selected members are not available." }, { status: 400 });
      const { error: addError } = await client.from("conversation_members").upsert(
        memberUserIds.map((memberUserId) => ({ conversation_id: conversationId, user_id: memberUserId, employee_id: profileMap.get(memberUserId)?.employee_id ?? null })),
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
      );
      if (addError) throw addError;
      return NextResponse.json({ added: memberUserIds });
    }

    const conversationId = String(body.conversation_id ?? "").trim();
    const text = String(body.body ?? "").trim();
    const requestedAttachment = body.attachment && typeof body.attachment === "object"
      ? body.attachment as { name?: string; path?: string; type?: string; size?: number }
      : null;
    if (!conversationId) {
      return NextResponse.json({ error: "A conversation is required." }, { status: 400 });
    }
    if ((!text && !requestedAttachment) || text.length > 4000) {
      return NextResponse.json({ error: "Your message must be between 1 and 4000 characters." }, { status: 400 });
    }
    const attachmentSize = requestedAttachment?.size;
    if (requestedAttachment && (!requestedAttachment.name || !requestedAttachment.path || !requestedAttachment.type || !Number.isFinite(attachmentSize) || (attachmentSize as number) <= 0 || (attachmentSize as number) > 10 * 1024 * 1024)) {
      return NextResponse.json({ error: "Attachments must be valid files up to 10 MB." }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return NextResponse.json({ error: "You do not have access to this conversation." }, { status: 403 });
    }

    const { data: message, error: messageError } = await client
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        sender_employee_id: employeeId,
        body: text || "Attachment",
      })
      .select("id, conversation_id, body, created_at, sender_employee_id")
      .single();

    if (messageError) throw messageError;

    if (requestedAttachment) {
      const { error: attachmentError } = await client.from("chat_attachments").insert({
        message_id: message.id,
        conversation_id: conversationId,
        uploaded_by: user.id,
        file_name: requestedAttachment.name,
        file_path: requestedAttachment.path,
        file_type: requestedAttachment.type,
        file_size: requestedAttachment.size,
      });
      if (attachmentError) throw attachmentError;
    }

    return NextResponse.json({
      message: {
        id: message.id,
        sender: "me",
        text: message.body,
        time: toTime(message.created_at),
        seen: false,
        attachment: requestedAttachment ? {
          name: requestedAttachment.name,
          path: requestedAttachment.path,
          type: requestedAttachment.type,
          size: requestedAttachment.size,
        } : null,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not send message.") }, { status: 500 });
  }
}
