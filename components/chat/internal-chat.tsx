"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconPlus, IconBell, IconMenu, IconArrowRight, IconUpload } from "@/components/icons";
import { cn } from "@/lib/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/auth-provider";

type ChatType = "dm" | "group" | "workspace";

type Conversation = {
  id: string;
  type: ChatType;
  name: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
  accent: string;
  members?: Array<{ user_id: string | null; name?: string; employee_id?: number | null }>;
};

type Message = {
  id: string;
  sender: "me" | "them";
  text: string;
  time: string;
  senderName?: string;
  seen?: boolean;
  pending?: boolean;
  failed?: boolean;
  attachment?: Attachment | null;
};

type Attachment = {
  id?: string;
  name: string;
  path: string;
  type: string;
  size: number;
};

type ChatParticipant = {
  id: string;
  user_id: string;
  employee_id?: number | null;
  name: string;
  role?: string;
};

function appendUniqueMessage(current: Message[], nextMessage: Message) {
  if (current.some((message) => message.id === nextMessage.id)) return current;
  return [...current, nextMessage];
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Now";
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Now";
  }
}

let notificationAudioContext: AudioContext | null = null;

function playChatNotificationSound() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  notificationAudioContext ??= new window.AudioContext();
  const context = notificationAudioContext;
  const play = () => {
    const start = context.currentTime;
    for (const [frequency, offset] of [[740, 0], [980, 0.16], [1240, 0.32]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.42);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.44);
    }
  };
  if (context.state === "suspended") void context.resume().then(play);
  else play();
}

function showChatSystemNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body,
    icon: "/icon-512.svg",
    badge: "/icon-512.svg",
    tag: `internal-chat-${Date.now()}`,
    renotify: true,
    silent: false,
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(title, options))
      .catch(() => new Notification(title, options));
    return;
  }
  new Notification(title, options);
}

function AttachmentThumbnail({
  attachment,
  dark,
  onOpen,
}: {
  attachment: Attachment;
  dark: boolean;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!attachment.type.startsWith("image/")) return () => undefined;
    getSupabaseBrowserClient().storage.from("chat-attachments").createSignedUrl(attachment.path, 300)
      .then((result: { data: { signedUrl?: string } | null }) => {
        if (mounted) setUrl(result.data?.signedUrl ?? null);
      });
    return () => {
      mounted = false;
    };
  }, [attachment.path, attachment.type]);

  return (
    <button type="button" onClick={onOpen} className={cn("mb-2 flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:scale-[1.01]", dark ? "bg-white/15 text-white" : "bg-white text-foreground")}>
      {url ? <img src={url} alt={attachment.name} className="h-14 w-14 rounded-lg object-cover" /> : <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-lg", dark ? "bg-white/15" : "bg-stone-100")}><IconUpload className="h-5 w-5" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{attachment.name}</span>
        <span className={cn("mt-1 block text-[10px]", dark ? "text-white/65" : "text-stone-400")}>{attachment.type.startsWith("image/") ? "View image" : "Open file"} · {Math.max(1, Math.round(attachment.size / 1024))} KB</span>
      </span>
    </button>
  );
}

export function InternalChatPage() {
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);
  const [manageGroupMemberIds, setManageGroupMemberIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [attachmentViewer, setAttachmentViewer] = useState<{ attachment: Attachment; url: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingChannelRef = useRef<{ send: (payload: { type: "broadcast"; event: string; payload: unknown }) => Promise<unknown> } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadConversations() {
      try {
        setLoading(true);
        const response = await fetchWithTimeout("/api/chat", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load chats.");

        const nextConversations = Array.isArray(result.conversations) ? result.conversations : [];
        if (!mounted) return;
        setConversations(nextConversations);
        const requestedConversationId = new URLSearchParams(window.location.search).get("conversation_id");
        setActiveConversationId((current) => current ?? requestedConversationId ?? nextConversations[0]?.id ?? null);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof DOMException && loadError.name === "AbortError"
          ? "Chat server did not respond. Please retry."
          : loadError instanceof Error ? loadError.message : "Could not load chats.");
        setConversations([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadConversations();
    return () => {
      mounted = false;
    };
  }, [retryKey]);

  useEffect(() => {
    if (!activeConversationId) return;
    const conversationId = activeConversationId;
    let mounted = true;
    setMessages([]);

    async function loadMessages() {
      try {
        const response = await fetchWithTimeout(`/api/chat?conversation_id=${encodeURIComponent(conversationId)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load messages.");
        if (mounted) setMessages(Array.isArray(result.messages) ? result.messages : []);
      } catch (loadError) {
        if (!mounted) return;
        setMessages([]);
        setError(loadError instanceof DOMException && loadError.name === "AbortError"
          ? "Conversation did not load. Please retry."
          : loadError instanceof Error ? loadError.message : "Could not load messages.");
      }
    }

    loadMessages();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`chat-live-${conversationId}`, { config: { presence: { key: user?.id ?? "anonymous" } } })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload: { new: { id: string; body: string; created_at: string; sender_user_id?: string } }) => {
        const nextMessage = payload.new as { id: string; body: string; created_at: string; sender_user_id?: string };
        if (!nextMessage || nextMessage.sender_user_id === user?.id) return;
        setMessages((current) => appendUniqueMessage(current, {
          id: String(nextMessage.id),
          sender: "them",
          text: nextMessage.body,
          time: formatTime(nextMessage.created_at),
        }));
        setConversations((current) => current.map((conversation) => conversation.id === conversationId
          ? { ...conversation, preview: nextMessage.body, time: formatTime(nextMessage.created_at) }
          : conversation));
        const response = await fetchWithTimeout(`/api/chat?conversation_id=${encodeURIComponent(conversationId)}`, { cache: "no-store" });
        const result = await response.json();
        if (mounted && response.ok && Array.isArray(result.messages)) setMessages(result.messages);
      })
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState() as Record<string, Array<{ userId: string; name: string; typing?: boolean }>>;
        const members = Object.values(presenceState).flatMap((entries) => entries);
        const others = members.filter((member) => member.userId !== user?.id);
        setTypingUsers([...new Set(others.filter((member) => member.typing).map((member) => member.name))]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload: { userId?: string; name?: string; typing?: boolean } }) => {
        if (!payload?.userId || payload.userId === user?.id) return;
        setTypingUsers((current) => payload.typing
          ? [...new Set([...current, payload.name || "Someone"])]
          : current.filter((name) => name !== (payload.name || "Someone")));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: user?.id, name: profile?.full_name || user?.email || "Someone", typing: false, onlineAt: new Date().toISOString() });
        }
      });
    typingChannelRef.current = channel;

    return () => {
      mounted = false;
      typingChannelRef.current = null;
      setIsOtherOnline(false);
      setTypingUsers([]);
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, profile?.full_name, user?.email, user?.id]);

  useEffect(() => {
    function handlePresence(event: Event) {
      const onlineUserIds = (event as CustomEvent<string[]>).detail ?? [];
      setConversations((current) => current.map((conversation) => {
        const otherMemberIds = (conversation.members ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id) && id !== user?.id);
        return conversation.type === "dm" ? { ...conversation, online: otherMemberIds.some((id) => onlineUserIds.includes(id)) } : conversation;
      }));
      const active = conversations.find((conversation) => conversation.id === activeConversationId);
      const otherMemberIds = (active?.members ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id) && id !== user?.id);
      setIsOtherOnline(otherMemberIds.some((id) => onlineUserIds.includes(id)));
    }

    window.addEventListener("chat:presence", handlePresence);
    return () => window.removeEventListener("chat:presence", handlePresence);
  }, [activeConversationId, conversations, user?.id]);

  const filteredConversations = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return conversations;

    return conversations.filter((conversation) =>
      conversation.name.toLowerCase().includes(text) ||
      conversation.preview.toLowerCase().includes(text),
    );
  }, [conversations, query]);

  const activeConversation =
    filteredConversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    null;

  const visibleMessages = useMemo(() => {
    const text = messageQuery.trim().toLowerCase();
    if (!text) return messages;
    return messages.filter((message) =>
      message.text.toLowerCase().includes(text) ||
      message.attachment?.name.toLowerCase().includes(text),
    );
  }, [messageQuery, messages]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const image = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image || !activeConversationId) return;
      event.preventDefault();
      setSelectedFile(image);
      setPastedImage(URL.createObjectURL(image));
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activeConversationId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, messages.length, typingUsers.length]);

  async function sendMessage(body: string, file: File | null = null) {
    if ((!body && !file) || !activeConversationId || sending || uploading) return;

    const pendingId = `pending-${Date.now()}`;
    const conversationId = activeConversationId;
    setSending(true);
    setSendingMessageId(pendingId);
    setError(null);
    try {
      let attachment: Attachment | null = null;
      if (file) {
        setUploading(true);
        if (file.size > 10 * 1024 * 1024) throw new Error("Attachments must be smaller than 10 MB.");
        const supabase = getSupabaseBrowserClient();
        const path = `${activeConversationId}/${user?.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const upload = await supabase.storage.from("chat-attachments").upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        attachment = { name: file.name, path, type: file.type, size: file.size };
      }

      setMessages((current) => [...current, {
        id: pendingId,
        sender: "me",
        text: body || "Attachment",
        time: "Now",
        pending: true,
        attachment,
      }]);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: activeConversationId, body, attachment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send message.");

      setMessages((current) => current.map((message) => message.id === pendingId ? result.message as Message : message));
      setDraft("");
      setSelectedFile(null);
      setPastedImage(null);
      setConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? { ...conversation, preview: attachment ? `Attachment: ${attachment.name}` : body, time: result.message.time }
        : conversation));
    } catch (sendError) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, pending: false, failed: true } : message));
      setError(sendError instanceof Error ? sendError.message : "Could not send message.");
    } finally {
      setSending(false);
      setUploading(false);
      setSendingMessageId(null);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!typingChannelRef.current || !user?.id) return;
    void typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { userId: user.id, name: profile?.full_name || user.email || "Someone", typing: true } });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      void typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: user.id, name: profile?.full_name || user.email || "Someone", typing: false } });
    }, 900);
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(draft.trim(), selectedFile);
  }

  async function openAttachment(attachment: Attachment) {
    const { data, error: signedUrlError } = await getSupabaseBrowserClient()
      .storage.from("chat-attachments").createSignedUrl(attachment.path, 300);
    if (signedUrlError || !data?.signedUrl) {
      setError("Could not open this attachment.");
      return;
    }
    setAttachmentViewer({ attachment, url: data.signedUrl });
  }

  async function enableChatNotifications() {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") {
        setError("Browser notifications are blocked. Allow notifications for this site in browser settings.");
        return;
      }
    }
    playChatNotificationSound();
    setError("Notifications and chat sound are enabled on this device.");
  }

  async function openNewChat() {
    setError(null);
    try {
      const response = await fetch("/api/chat?action=participants", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load people.");
      setParticipants(Array.isArray(result.participants) ? result.participants : []);
      setNewChatOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load people.");
    }
  }

  async function openNewGroup() {
    setError(null);
    try {
      const response = await fetch("/api/chat?action=participants", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load people.");
      setParticipants(Array.isArray(result.participants) ? result.participants : []);
      setGroupTitle("");
      setGroupMemberIds([]);
      setNewGroupOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load people.");
    }
  }

  async function createGroup() {
    if (!groupTitle.trim() || !groupMemberIds.length || creatingGroup) return;
    setCreatingGroup(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_group", title: groupTitle.trim(), member_user_ids: groupMemberIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create group.");
      const conversationResponse = await fetch("/api/chat", { cache: "no-store" });
      const conversationResult = await conversationResponse.json();
      if (!conversationResponse.ok) throw new Error(conversationResult.error ?? "Could not refresh chats.");
      setConversations(Array.isArray(conversationResult.conversations) ? conversationResult.conversations : []);
      setActiveConversationId(result.conversation?.id ?? null);
      setNewGroupOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function manageGroup(operation: "add_members" | "remove_member" | "delete_group", memberUserId?: string) {
    if (!activeConversationId || profile?.role !== "superadmin") return;
    if (operation === "delete_group" && !window.confirm("Delete this group and all its messages?")) return;
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manage_group", operation, conversation_id: activeConversationId, member_user_ids: manageGroupMemberIds, member_user_id: memberUserId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update group.");
      if (operation === "delete_group") {
        setManageGroupOpen(false);
        setActiveConversationId(null);
      } else {
        const refresh = await fetch("/api/chat", { cache: "no-store" });
        const refreshed = await refresh.json();
        if (refresh.ok) setConversations(Array.isArray(refreshed.conversations) ? refreshed.conversations : []);
        setManageGroupMemberIds([]);
      }
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : "Could not update group.");
    }
  }

  async function openManageGroup() {
    if (profile?.role !== "superadmin") return;
    try {
      const response = await fetch("/api/chat?action=participants", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load people.");
      setParticipants(Array.isArray(result.participants) ? result.participants : []);
      setManageGroupMemberIds([]);
      setManageGroupOpen(true);
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : "Could not load people.");
    }
  }

  async function startDirectMessage(participant: ChatParticipant) {
    if (creatingChat || !participant.user_id) return;
    setCreatingChat(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_dm",
          participant_user_id: participant.user_id,
          participant_employee_id: participant.employee_id ?? null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not start chat.");

      const conversationResponse = await fetch("/api/chat", { cache: "no-store" });
      const conversationResult = await conversationResponse.json();
      if (!conversationResponse.ok) throw new Error(conversationResult.error ?? "Could not refresh chats.");
      const nextConversations = Array.isArray(conversationResult.conversations) ? conversationResult.conversations : [];
      setConversations(nextConversations);
      setActiveConversationId(result.conversation?.id ?? null);
      setNewChatOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start chat.");
    } finally {
      setCreatingChat(false);
    }
  }

  if (loading && !conversations.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-sm text-muted shadow-sm">
        <p>{error ?? "Loading conversations..."}</p>
        {error ? <button type="button" onClick={() => { setError(null); setLoading(true); setRetryKey((value) => value + 1); }} className="mt-4 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">Retry</button> : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <header className="flex flex-col gap-3 rounded-[1.5rem] border border-border bg-white p-4 shadow-[0_16px_40px_rgba(28,20,18,0.05)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Office communication</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Internal Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-border text-stone-500 transition hover:border-primary/30 hover:text-primary" aria-label="Search messages">
            <IconSearch className="h-4 w-4" />
          </button>
          <button type="button" onClick={enableChatNotifications} className="grid h-10 w-10 place-items-center rounded-xl border border-border text-stone-500 transition hover:border-primary/30 hover:text-primary" aria-label="Enable chat notifications and sound" title="Enable notifications and sound">
            <IconBell className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      ) : null}

      <div className="h-[calc(100dvh-10.5rem)] min-h-[520px] overflow-hidden rounded-[1.5rem] border border-border bg-white shadow-[0_18px_50px_rgba(28,20,18,0.06)]">
        <div className="grid h-full min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-border bg-stone-50/60 lg:border-b-0 lg:border-r">
            <div className="border-b border-border p-4">
              <label className="relative block">
                <span className="sr-only">Search conversations</span>
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search conversations"
                  className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-stone-400 focus:border-primary/40 focus:outline-none"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!filteredConversations.length ? (
                <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
                  No conversations found.
                </div>
              ) : null}

              <div className="mb-4">
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Direct messages</p>
                <div className="space-y-2">
                  {filteredConversations.filter((item) => item.type === "dm").map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversationId(conversation.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                        conversation.id === activeConversation?.id
                          ? "border-primary/20 bg-white shadow-[0_8px_22px_rgba(28,20,18,0.04)]"
                          : "border-transparent bg-transparent hover:border-border hover:bg-white",
                      )}
                    >
                      <span className={cn("grid h-10 w-10 place-items-center rounded-full text-xs font-bold", conversation.accent)}>
                        {conversation.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{conversation.name}</span>
                          {conversation.online ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="online" /> : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-stone-500">{conversation.preview}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-stone-400">{conversation.time}</span>
                        {conversation.unread > 0 ? (
                          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {conversation.unread > 9 ? "9+" : conversation.unread}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Groups</p>
                <div className="space-y-2">
                  {filteredConversations.filter((item) => item.type === "group").map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversationId(conversation.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                        conversation.id === activeConversation?.id
                          ? "border-primary/20 bg-white shadow-[0_8px_22px_rgba(28,20,18,0.04)]"
                          : "border-transparent bg-transparent hover:border-border hover:bg-white",
                      )}
                    >
                      <span className={cn("grid h-10 w-10 place-items-center rounded-full text-xs font-bold", conversation.accent)}>
                        {conversation.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{conversation.name}</span>
                        <span className="mt-1 block truncate text-xs text-stone-500">{conversation.preview}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-stone-400">{conversation.time}</span>
                        {conversation.unread > 0 ? (
                          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {conversation.unread > 9 ? "9+" : conversation.unread}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Workspaces</p>
                <div className="space-y-2">
                  {filteredConversations.filter((item) => item.type === "workspace").map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversationId(conversation.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                        conversation.id === activeConversation?.id
                          ? "border-primary/20 bg-white shadow-[0_8px_22px_rgba(28,20,18,0.04)]"
                          : "border-transparent bg-transparent hover:border-border hover:bg-white",
                      )}
                    >
                      <span className={cn("grid h-10 w-10 place-items-center rounded-full text-xs font-bold", conversation.accent)}>
                        {conversation.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{conversation.name}</span>
                        <span className="mt-1 block truncate text-xs text-stone-500">{conversation.preview}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-stone-400">{conversation.time}</span>
                        {conversation.unread > 0 ? (
                          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {conversation.unread > 9 ? "9+" : conversation.unread}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <button type="button" onClick={openNewChat} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-600 hover:border-primary/30 hover:text-primary">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-stone-500">
                    <IconPlus className="h-4 w-4" />
                  </span>
                  New Chat
                </button>
                {profile?.role === "superadmin" ? <button type="button" onClick={openNewGroup} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-600 hover:border-primary/30 hover:text-primary">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-stone-500">
                    <IconPlus className="h-4 w-4" />
                  </span>
                  New Group
                </button> : null}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-white">
            {activeConversation ? (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-11 w-11 place-items-center rounded-full text-sm font-bold", "bg-rose-100 text-rose-600")}>
                      {activeConversation.name.slice(0, 1)}
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{activeConversation.name}</h2>
                      <p className="flex items-center gap-1.5 text-xs text-stone-500">
                        {activeConversation.type === "dm" ? <span className={cn("h-1.5 w-1.5 rounded-full", isOtherOnline ? "bg-emerald-500" : "bg-stone-300")} /> : null}
                        {activeConversation.type === "dm" ? (isOtherOnline ? "Online" : "Offline") : activeConversation.type === "group" ? `${activeConversation.members?.length ?? 0} members` : "Project workspace"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {messageSearchOpen ? (
                      <input
                        autoFocus
                        value={messageQuery}
                        onChange={(event) => setMessageQuery(event.target.value)}
                        placeholder="Search messages"
                        className="w-44 rounded-lg border border-border bg-stone-50 px-3 py-2 text-xs text-foreground outline-none focus:border-primary/40"
                        aria-label="Search messages in conversation"
                      />
                    ) : null}
                    <button type="button" onClick={() => { setMessageSearchOpen((open) => !open); if (messageSearchOpen) setMessageQuery(""); }} className={cn("grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-primary", messageSearchOpen && "bg-primary-soft text-primary")} aria-label="Search in conversation" title="Search messages">
                      <IconSearch className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => { if (activeConversation.type === "group" && profile?.role === "superadmin") void openManageGroup(); }} className={cn("grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-primary", activeConversation.type !== "group" || profile?.role !== "superadmin" ? "cursor-default opacity-60" : "")} aria-label="Group options" title={activeConversation.type === "group" && profile?.role === "superadmin" ? "Manage group" : "More options"}>
                      <IconMenu className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col">
                  <div ref={threadRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,_rgba(255,86,86,0.04),_transparent_35%)] p-5">
                    {visibleMessages.length ? (
                      visibleMessages.map((message) => (
                        <div key={message.id} className={cn("flex chat-message-in", message.sender === "me" ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[75%] rounded-2xl px-4 py-3 shadow-sm transition", message.sender === "me" ? "bg-primary text-white" : "border border-border bg-stone-50 text-foreground", message.pending && "opacity-70", message.failed && "ring-2 ring-red-300")}>
                            {activeConversation.type === "group" ? <p className={cn("mb-1 text-[11px] font-bold", message.sender === "me" ? "text-white/80" : "text-primary")}>{message.sender === "me" ? "You" : message.senderName || "Group member"}</p> : null}
                            {message.attachment ? <AttachmentThumbnail attachment={message.attachment} dark={message.sender === "me"} onOpen={() => openAttachment(message.attachment as Attachment)} /> : null}
                            <p className="text-sm leading-relaxed">{message.text}</p>
                            <p className={cn("mt-1 flex items-center text-[10px] font-medium", message.sender === "me" ? "text-white/80" : "text-stone-400")}>
                              {message.pending ? <><span className="mr-1.5 h-2.5 w-2.5 animate-spin rounded-full border border-white/40 border-t-white" />Sending...</> : message.failed ? "Failed to send" : message.time}{message.sender === "me" && !message.pending && !message.failed ? (
                                <span className={cn("ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5", message.seen ? "bg-white/20 text-white" : "bg-black/10 text-white/75")}>
                                  <span aria-hidden>{message.seen ? "✓✓" : "✓"}</span>
                                  {message.seen ? "Seen" : "Sent"}
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="grid min-h-full place-items-center text-sm text-stone-500">
                        {messageQuery ? "No matching messages found." : "No messages yet — start the conversation."}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSendMessage} className="border-t border-border bg-white p-4">
                    {typingUsers.length ? <p className="mb-2 px-1 text-xs font-medium text-primary animate-pulse">{typingUsers.join(" and ")} {typingUsers.length === 1 ? "is" : "are"} typing...</p> : null}
                    {selectedFile ? (
                      <div className="mb-2 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-xs text-foreground">
                        {pastedImage ? <img src={pastedImage} alt="Pasted screenshot preview" className="h-12 w-12 rounded-lg object-cover" /> : <IconUpload className="h-4 w-4 text-primary" />}
                        <span className="min-w-0 flex-1 truncate font-semibold">{selectedFile.name}</span>
                        <button type="button" onClick={() => { setSelectedFile(null); setPastedImage(null); }} className="font-bold text-stone-400 hover:text-primary" aria-label="Remove attachment">×</button>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-stone-50 px-3 py-2.5 shadow-inner">
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(event) => { const file = event.target.files?.[0] ?? null; setSelectedFile(file); setPastedImage(file?.type.startsWith("image/") ? URL.createObjectURL(file) : null); event.currentTarget.value = ""; }} />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-stone-500 hover:text-primary" aria-label="Attach file">
                        <IconUpload className="h-4 w-4" />
                      </button>
                      <input
                        type="text"
                        value={draft}
                        onChange={(event) => handleDraftChange(event.target.value)}
                        placeholder={selectedFile ? "Add a caption..." : "Type a message or paste an image..."}
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-stone-400 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={(!draft.trim() && !selectedFile) || sending || uploading}
                        className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white shadow-[0_10px_24px_rgba(228,90,90,0.22)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Send message"
                      >
                        {sendingMessageId ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <IconArrowRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center bg-stone-50 text-sm text-stone-500">
                Select a conversation to begin.
              </div>
            )}
          </section>
        </div>
      </div>

      {attachmentViewer ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={attachmentViewer.attachment.name} onMouseDown={() => setAttachmentViewer(null)}>
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_100px_rgba(0,0,0,0.35)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
              <span className="min-w-0 truncate text-sm font-semibold text-foreground">{attachmentViewer.attachment.name}</span>
              <div className="flex items-center gap-2">
                <a href={attachmentViewer.url} download={attachmentViewer.attachment.name} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/90">Download</a>
                <button type="button" onClick={() => setAttachmentViewer(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100" aria-label="Close attachment preview">Close</button>
              </div>
            </div>
            <div className="grid min-h-[260px] place-items-center overflow-auto bg-stone-100 p-4">
              {attachmentViewer.attachment.type.startsWith("image/") ? <img src={attachmentViewer.url} alt={attachmentViewer.attachment.name} className="max-h-[76vh] max-w-full rounded-xl object-contain shadow-sm" /> : <a href={attachmentViewer.url} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-white px-5 py-4 text-sm font-semibold text-primary">Open file in a new tab</a>}
            </div>
          </div>
        </div>
      ) : null}

      {manageGroupOpen && activeConversation?.type === "group" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/30 p-4" role="presentation" onMouseDown={() => setManageGroupOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-[0_24px_70px_rgba(28,20,18,0.2)]" role="dialog" aria-modal="true" aria-labelledby="manage-group-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="manage-group-title" className="text-lg font-bold text-foreground">Manage {activeConversation.name}</h2>
                <p className="mt-1 text-sm text-stone-500">{activeConversation.members?.length ?? 0} current members</p>
              </div>
              <button type="button" onClick={() => setManageGroupOpen(false)} className="text-sm font-semibold text-stone-400 hover:text-foreground" aria-label="Close group management">Close</button>
            </div>
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {(activeConversation.members ?? []).map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">{(member.name || "U").slice(0, 1)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{member.name || "User"}</span>
                {member.user_id === user?.id ? <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Admin</span> : <button type="button" onClick={() => manageGroup("remove_member", member.user_id ?? undefined)} className="text-xs font-semibold text-stone-400 hover:text-red-600">Remove</button>}
              </div>)}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-stone-400">Add members</p>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {participants.filter((participant) => !(activeConversation.members ?? []).some((member) => member.user_id === participant.user_id)).map((participant) => {
                const checked = manageGroupMemberIds.includes(participant.user_id);
                return <button key={participant.id} type="button" onClick={() => setManageGroupMemberIds((current) => checked ? current.filter((id) => id !== participant.user_id) : [...current, participant.user_id])} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left", checked ? "border-primary/30 bg-primary-soft" : "border-border")}>
                  <span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold", checked ? "bg-primary text-white" : "bg-stone-100 text-stone-500")}>{checked ? "✓" : participant.name.slice(0, 1)}</span><span className="text-sm font-semibold text-foreground">{participant.name}</span>
                </button>;
              })}
            </div>
            <button type="button" onClick={() => manageGroup("add_members")} disabled={!manageGroupMemberIds.length} className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Add selected members</button>
            <button type="button" onClick={() => manageGroup("delete_group")} className="mt-3 w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50">Delete entire group</button>
          </div>
        </div>
      ) : null}

      {newGroupOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/30 p-4" role="presentation" onMouseDown={() => setNewGroupOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-[0_24px_70px_rgba(28,20,18,0.2)]" role="dialog" aria-modal="true" aria-labelledby="new-group-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="new-group-title" className="text-lg font-bold text-foreground">Create a group</h2>
                <p className="mt-1 text-sm text-stone-500">Choose the people who can participate.</p>
              </div>
              <button type="button" onClick={() => setNewGroupOpen(false)} className="text-sm font-semibold text-stone-400 hover:text-foreground" aria-label="Close new group">Close</button>
            </div>
            <input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={80} placeholder="Group name" className="mt-4 w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/40" />
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {participants.map((participant) => {
                const checked = groupMemberIds.includes(participant.user_id);
                return <button key={participant.id} type="button" onClick={() => setGroupMemberIds((current) => checked ? current.filter((id) => id !== participant.user_id) : [...current, participant.user_id])} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition", checked ? "border-primary/30 bg-primary-soft" : "border-border hover:border-primary/30")}>
                  <span className={cn("grid h-9 w-9 place-items-center rounded-full text-sm font-bold", checked ? "bg-primary text-white" : "bg-rose-100 text-rose-600")}>{checked ? "✓" : participant.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{participant.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone-400">{participant.role || "employee"}</span>
                </button>;
              })}
            </div>
            <button type="button" onClick={createGroup} disabled={!groupTitle.trim() || !groupMemberIds.length || creatingGroup} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{creatingGroup ? "Creating group..." : `Create group${groupMemberIds.length ? ` · ${groupMemberIds.length} members` : ""}`}</button>
          </div>
        </div>
      ) : null}

      {newChatOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/30 p-4" role="presentation" onMouseDown={() => setNewChatOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-[0_24px_70px_rgba(28,20,18,0.2)]" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="new-chat-title" className="text-lg font-bold text-foreground">Start a direct chat</h2>
                <p className="mt-1 text-sm text-stone-500">Choose an employee to continue.</p>
              </div>
              <button type="button" onClick={() => setNewChatOpen(false)} className="text-sm font-semibold text-stone-400 hover:text-foreground" aria-label="Close new chat">Close</button>
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {participants.map((participant) => (
                <button key={participant.id} type="button" onClick={() => startDirectMessage(participant)} disabled={creatingChat} className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left transition hover:border-primary/30 hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">{participant.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{participant.name}</span>
                  {participant.role ? <span className="text-[10px] uppercase tracking-[0.12em] text-stone-400">{participant.role}</span> : null}
                </button>
              ))}
              {!participants.length ? <p className="py-6 text-center text-sm text-stone-500">No people found.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InternalChatLauncher({ currentPath }: { currentPath?: string }) {
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const handleNotification = () => setNotificationCount((count) => count + 1);
    const clearNotifications = () => setNotificationCount(0);
    window.addEventListener("chat:notification", handleNotification);
    window.addEventListener("chat:notification-clear", clearNotifications);
    return () => {
      window.removeEventListener("chat:notification", handleNotification);
      window.removeEventListener("chat:notification-clear", clearNotifications);
    };
  }, []);

  if (!currentPath || currentPath.startsWith("/dashboard/internal-chat")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Link
        href="/dashboard/internal-chat"
        className="group relative inline-flex items-center gap-2 rounded-full bg-[#1c1917] px-4 py-3 text-sm font-bold text-white shadow-[0_20px_45px_rgba(28,20,18,0.18)] transition hover:-translate-y-0.5 hover:bg-[#2a2423]"
        aria-label="Open internal chat"
      >
        <span className="text-base">💬</span>
        {notificationCount > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
      </Link>
    </div>
  );
}

type ChatToast = {
  conversationId: string;
  name: string;
  text: string;
  time: string;
};

export function InternalChatNotifications({ currentPath }: { currentPath?: string }) {
  const { user } = useAuth();
  const [toast, setToast] = useState<ChatToast | null>(null);
  const [toastCount, setToastCount] = useState(0);

  useEffect(() => {
    function unlockSound() {
      if (typeof window === "undefined" || !("AudioContext" in window)) return;
      notificationAudioContext ??= new window.AudioContext();
      if (notificationAudioContext.state === "suspended") void notificationAudioContext.resume();
    }

    window.addEventListener("pointerdown", unlockSound, { once: true });
    return () => window.removeEventListener("pointerdown", unlockSound);
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const currentUserId = user.id;
    const supabase = getSupabaseBrowserClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];
    const presenceChannel = supabase
      .channel("chat-presence-global", { config: { presence: { key: currentUserId } } })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState() as Record<string, Array<{ userId?: string }>>;
        const onlineUserIds = Object.values(state).flatMap((entries) => entries.map((entry) => entry.userId).filter((id): id is string => Boolean(id)));
        window.dispatchEvent(new CustomEvent("chat:presence", { detail: onlineUserIds }));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ userId: currentUserId, onlineAt: new Date().toISOString() });
        }
      });
    channels.push(presenceChannel);

    async function subscribeToChats() {
      const response = await fetchWithTimeout("/api/chat", { cache: "no-store" });
      if (!response.ok || !mounted) return;
      const result = await response.json();
      const conversations = Array.isArray(result.conversations) ? result.conversations as Conversation[] : [];
      for (const conversation of conversations) {
        const channel = supabase
          .channel(`chat-notifications-${conversation.id}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `conversation_id=eq.${conversation.id}`,
          }, (payload: { new: { body: string; created_at: string; sender_user_id?: string } }) => {
            const message = payload.new;
            if (!message || message.sender_user_id === currentUserId || !mounted) return;
            const nextToast = { conversationId: conversation.id, name: conversation.name, text: message.body, time: formatTime(message.created_at) };
            setToast(nextToast);
            setToastCount((count) => count + 1);
            window.dispatchEvent(new CustomEvent("chat:notification"));
            playChatNotificationSound();
            window.setTimeout(() => setToast((current) => current?.conversationId === conversation.id ? null : current), 7000);
            showChatSystemNotification(conversation.name, message.body);
          })
          .subscribe();
        channels.push(channel);
      }
    }

    subscribeToChats().catch(() => undefined);
    return () => {
      mounted = false;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [currentPath, user?.id]);

  if (!toast) return null;

  return (
    <button
      type="button"
      onClick={() => { setToast(null); setToastCount(0); window.dispatchEvent(new Event("chat:notification-clear")); window.location.href = `/dashboard/internal-chat?conversation_id=${encodeURIComponent(toast.conversationId)}`; }}
      className="chat-toast-in fixed bottom-24 right-5 z-[60] flex w-[min(360px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-white/80 bg-[#1c1917] px-4 py-3 text-left text-white shadow-[0_20px_60px_rgba(28,20,18,0.25)]"
      aria-label={`Open new message from ${toast.name}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold">{toast.name.slice(0, 1)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3 text-sm font-bold"><span className="truncate">{toast.name}</span><span className="text-[10px] font-medium text-white/55">{toast.time}</span></span>
        <span className="mt-1 block truncate text-xs text-white/70">{toast.text}</span>
        {toastCount > 1 ? <span className="mt-1 inline-flex rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{toastCount} new notifications</span> : null}
      </span>
    </button>
  );
}
