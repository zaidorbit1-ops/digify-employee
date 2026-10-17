"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { WhatsAppInboxChat, WhatsAppInboxMessage, WhatsAppInboxSnapshot } from "@/lib/whatsapp-service";

type InboxResponse = { inbox: WhatsAppInboxSnapshot; error?: string };
type MessagesResponse = { messages: WhatsAppInboxMessage[]; error?: string };

function formatTime(timestamp: number) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result && typeof result.error === "string" ? result.error : "The WhatsApp request failed.",
    );
  }
  return result as T;
}

export default function WhatsAppInbox() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId;
  const [inbox, setInbox] = useState<WhatsAppInboxSnapshot | null>(null);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppInboxMessage[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async (showLoading = false) => {
    if (!companyId) return;
    if (showLoading) setLoadingInbox(true);
    try {
      const response = await fetch(`/api/whatsapp/${encodeURIComponent(companyId)}/chats`, {
        cache: "no-store",
      });
      const result = await parseResponse<InboxResponse>(response);
      setInbox(result.inbox);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load WhatsApp chats.");
    } finally {
      if (showLoading) setLoadingInbox(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadInbox(true);
    const interval = window.setInterval(() => void loadInbox(), 2500);
    return () => window.clearInterval(interval);
  }, [loadInbox]);

  useEffect(() => {
    if (!companyId || !selectedJid) {
      setMessages([]);
      return;
    }
    let active = true;
    const loadMessages = async (showLoading: boolean) => {
      if (showLoading) setLoadingMessages(true);
      try {
        const query = new URLSearchParams({ jid: selectedJid });
        const response = await fetch(
          `/api/whatsapp/${encodeURIComponent(companyId)}/messages?${query.toString()}`,
          { cache: "no-store" },
        );
        const result = await parseResponse<MessagesResponse>(response);
        if (active) setMessages(result.messages);
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Could not load this conversation.");
        }
      } finally {
        if (active && showLoading) setLoadingMessages(false);
      }
    };

    void loadMessages(true);
    const interval = window.setInterval(() => void loadMessages(false), 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [companyId, selectedJid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedJid]);

  const visibleChats = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return inbox?.chats ?? [];
    return (inbox?.chats ?? []).filter((chat) =>
      `${chat.name} ${chat.jid} ${chat.last_message}`.toLocaleLowerCase().includes(query),
    );
  }, [inbox?.chats, search]);

  const selectedChat = useMemo(
    () => inbox?.chats.find((chat) => chat.jid === selectedJid) ?? null,
    [inbox?.chats, selectedJid],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJid || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/whatsapp/${encodeURIComponent(companyId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: selectedJid, text: draft }),
      });
      await parseResponse<{ success: true }>(response);
      setDraft("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send this message.");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[1500px] flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/whatsapp"
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
          >
            <span aria-hidden="true">←</span> Connections
          </Link>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Business CRM / WhatsApp</p>
            <h1 className="mt-1 text-2xl font-bold">WhatsApp chats</h1>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${inbox?.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {inbox?.status ?? "loading"}
        </span>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {inbox?.sync_status === "syncing" ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="flex flex-wrap justify-between gap-2">
            <span>Syncing chat history from WhatsApp. Chats will appear as they arrive.</span>
            {inbox.sync_progress !== null ? <span>{inbox.sync_progress}%</span> : null}
          </div>
          {inbox.sync_progress !== null ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, inbox.sync_progress))}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-border bg-white shadow-sm md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${selectedJid ? "hidden md:flex" : "flex"} min-h-[60vh] flex-col border-r border-border`}>
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-bold">Chats</h2>
            <label className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-stone-50 px-3 py-2">
              <span aria-hidden="true" className="text-muted">⌕</span>
              <input
                aria-label="Search chats"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                placeholder="Search chats or numbers"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingInbox ? (
              <p className="p-5 text-sm text-muted">Loading chats…</p>
            ) : visibleChats.length ? (
              visibleChats.map((chat: WhatsAppInboxChat) => (
                <button
                  type="button"
                  key={chat.jid}
                  onClick={() => setSelectedJid(chat.jid)}
                  className={`flex w-full items-start gap-3 border-b border-stone-100 px-4 py-3 text-left transition hover:bg-stone-50 ${selectedJid === chat.jid ? "bg-emerald-50/70" : ""}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                    {chat.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{chat.name}</span>
                      <span className="shrink-0 text-[10px] text-muted">{formatTime(chat.timestamp)}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{chat.last_message || chat.jid}</span>
                      {chat.unread_count > 0 ? (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{chat.unread_count}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm font-semibold">{search ? "No matching chats" : "No chats synced yet"}</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {inbox?.sync_status === "complete"
                    ? "WhatsApp did not provide chat history for this linked device. New chats will show here when activity arrives."
                    : "Waiting for WhatsApp to provide chat and contact history. History availability depends on WhatsApp and the linked device."}
                </p>
              </div>
            )}
          </div>
          <p className="border-t border-border px-4 py-3 text-[11px] text-muted">
            {inbox?.sync_status === "complete" ? "History sync complete" : "History may arrive in multiple batches"}
          </p>
        </aside>

        <main className={`${selectedJid ? "flex" : "hidden md:flex"} min-h-[60vh] min-w-0 flex-col`}>
          {selectedChat ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-stone-100 md:hidden"
                  onClick={() => setSelectedJid(null)}
                  aria-label="Back to chat list"
                >
                  ←
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                  {selectedChat.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{selectedChat.name}</h2>
                  <p className="truncate text-xs text-muted">{selectedChat.is_group ? "Group chat" : selectedChat.jid}</p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-[#f8f7f5] p-4 sm:p-6">
                {loadingMessages ? <p className="text-center text-xs text-muted">Loading messages…</p> : null}
                {!loadingMessages && messages.length === 0 ? (
                  <p className="mx-auto mt-10 max-w-sm rounded-xl bg-white px-4 py-3 text-center text-sm text-muted shadow-sm">
                    No messages are available in the local chat cache yet.
                  </p>
                ) : null}
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.from_me ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[75%] ${message.from_me ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm bg-white text-foreground"}`}>
                      {!message.from_me && message.sender_name ? (
                        <p className="mb-1 text-[10px] font-semibold text-emerald-700">{message.sender_name}</p>
                      ) : null}
                      <p>{message.text}</p>
                      <p className={`mt-1 text-right text-[10px] ${message.from_me ? "text-emerald-800/70" : "text-muted"}`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-border bg-white p-3 sm:p-4">
                <textarea
                  aria-label="Message"
                  className="max-h-36 min-h-11 flex-1 resize-y rounded-xl border border-border bg-stone-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                  placeholder="Type a message"
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  disabled={inbox?.status !== "connected" || sending}
                />
                <Button type="submit" disabled={!draft.trim() || sending || inbox?.status !== "connected"} loading={sending}>
                  Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-700" aria-hidden="true">◌</span>
              <h2 className="mt-4 text-lg font-bold">Your WhatsApp inbox</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                Select a chat to view messages. History is available only when WhatsApp sends it to this linked device.
              </p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}