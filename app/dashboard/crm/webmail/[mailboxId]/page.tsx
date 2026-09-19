"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconRefresh } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useParams } from "next/navigation";

type Message = {
  id: number;
  sender: string | null;
  recipients: string[];
  subject: string | null;
  text_body: string | null;
  is_read: boolean;
  received_at: string | null;
  sent_at: string | null;
};

type Thread = {
  id: number;
  subject: string | null;
  folder: string;
  is_starred: boolean;
  updated_at: string;
  crm_email_messages: Message[];
};

type Mailbox = { id: number; email_address: string; display_name: string; status: string };
const folders = ["inbox", "sent", "drafts", "starred", "archive", "trash", "spam"];

const folderLabels: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  starred: "Starred",
  archive: "Archive",
  trash: "Trash",
  spam: "Spam",
};

const folderMarks: Record<string, string> = {
  inbox: "IN",
  sent: "SE",
  drafts: "DR",
  starred: "ST",
  archive: "AR",
  trash: "TR",
  spam: "SP",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function MailboxWorkspace() {
  const params = useParams<{ mailboxId: string }>();
  const mailboxId = Number(params.mailboxId);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [folder, setFolder] = useState("inbox");
  const [search, setSearch] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [compose, setCompose] = useState({ to: "", cc: "", subject: "", text: "" });

  async function loadMailbox() {
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/webmail?mailbox_id=${mailboxId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load mailbox.");
      setMailbox(result.mailbox);
      setThreads(result.threads ?? []);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load mailbox.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isInteger(mailboxId) && mailboxId > 0) loadMailbox();
  }, [mailboxId]);

  const visibleThreads = useMemo(() => threads.filter((thread) => {
    const latest = thread.crm_email_messages.at(-1);
    const haystack = `${thread.subject ?? ""} ${latest?.sender ?? ""} ${latest?.text_body ?? ""}`.toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.toLowerCase());
    const matchesFolder = folder === "starred" ? thread.is_starred : thread.folder === folder;
    return matchesFolder && matchesSearch;
  }), [folder, search, threads]);

  async function syncInbox() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/webmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mailbox_id: mailboxId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sync Inbox.");
      setMessage({ text: result.message, tone: "success" });
      await loadMailbox();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not sync Inbox.", tone: "danger" });
    } finally {
      setSyncing(false);
    }
  }

  async function openMessage(item: Message) {
    setSelectedMessage(item);
    if (item.is_read) return;
    await fetch("/api/crm/webmail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: item.id, is_read: true }) });
    setThreads((current) => current.map((thread) => ({ ...thread, crm_email_messages: thread.crm_email_messages.map((messageItem) => messageItem.id === item.id ? { ...messageItem, is_read: true } : messageItem) })));
  }

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/webmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mailbox_id: mailboxId, action: "send", ...compose }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send email.");
      setComposeOpen(false);
      setCompose({ to: "", cc: "", subject: "", text: "" });
      setMessage({ text: result.message, tone: "success" });
      await loadMailbox();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not send email.", tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  const unread = threads.filter((thread) => thread.folder === "inbox" && thread.crm_email_messages.at(-1)?.is_read === false).length;

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/crm/webmail" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white text-muted shadow-sm transition hover:border-primary/30 hover:text-primary" aria-label="Back to mailboxes">←</Link>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">CRM Webmail</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{mailbox?.display_name || mailbox?.email_address || "Mailbox"}</h1>
          <p className="mt-0.5 text-sm text-muted">{mailbox?.email_address || "Secure company mailbox"}</p>
        </div>
        {mailbox?.status ? <Badge tone={mailbox.status === "connected" ? "success" : "warning"}>{mailbox.status}</Badge> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" loading={syncing} onClick={syncInbox}><IconRefresh className="h-4 w-4" />Sync inbox</Button>
        <Button onClick={() => setComposeOpen(true)}>Compose</Button>
      </div>
    </div>
    {message ? <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <div className="overflow-hidden rounded-2xl border border-[#d9e1e6] bg-white shadow-[0_18px_55px_rgba(24,50,74,0.08)]">
      <div className="grid min-h-[700px] lg:grid-cols-[218px_minmax(310px,0.78fr)_minmax(360px,1.22fr)]">
        <aside className="border-b border-[#e3e8eb] bg-[#f5f8fa] p-4 lg:border-b-0 lg:border-r">
          <Button className="mb-5 w-full justify-center bg-[#18324a] shadow-[0_10px_20px_rgba(24,50,74,0.16)] hover:bg-[#254b69]" onClick={() => setComposeOpen(true)}>Compose email</Button>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#81919c]">Folders</p>
          <nav className="space-y-1" aria-label="Mailbox folders">
            {folders.map((item) => <button key={item} className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${folder === item ? "bg-white text-[#18324a] shadow-sm ring-1 ring-[#dbe4e9]" : "text-[#637580] hover:bg-white hover:text-[#18324a]"}`} onClick={() => setFolder(item)}><span className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-md text-[9px] font-extrabold ${folder === item ? "bg-[#e8f0f4] text-[#18324a]" : "bg-[#e9eef1] text-[#81919c] group-hover:text-[#18324a]"}`}>{folderMarks[item]}</span>{folderLabels[item]}</span>{item === "inbox" && unread ? <span className="rounded-full bg-[#e95d5d] px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span> : null}</button>)}
          </nav>
          <div className="mt-8 rounded-xl border border-[#dbe5ea] bg-white p-3.5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#81919c]">Mailbox health</p><p className="mt-2 text-sm font-bold text-[#18324a]">{mailbox?.status === "connected" ? "Connected and ready" : "Needs attention"}</p><p className="mt-1 text-xs leading-5 text-[#7b8b95]">Your credentials stay encrypted on the server.</p></div>
        </aside>
        <section className="min-w-0 border-b border-[#e3e8eb] lg:border-b-0 lg:border-r">
          <div className="border-b border-[#e3e8eb] bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-lg font-extrabold text-[#18324a]">{folderLabels[folder]}</p><p className="mt-0.5 text-xs text-[#84939d]">{visibleThreads.length} conversation{visibleThreads.length === 1 ? "" : "s"}</p></div><button className="rounded-lg px-2 py-1 text-xs font-bold text-[#637580] hover:bg-[#f0f5f7]" onClick={loadMailbox}>Refresh</button></div>
            <div className="relative"><span className="pointer-events-none absolute left-3 top-2.5 text-xs text-[#91a0a9]">⌕</span><TextInput className="w-full bg-[#f5f8fa] pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {loading ? <div className="p-6 text-sm text-[#81919c]">Loading your mailbox...</div> : visibleThreads.length ? <div className="divide-y divide-[#edf1f3]">{visibleThreads.map((thread) => { const item = thread.crm_email_messages.at(-1); if (!item) return null; return <button key={thread.id} className={`group flex w-full items-start gap-3 p-4 text-left transition hover:bg-[#f5f8fa] ${item.is_read ? "" : "border-l-2 border-[#e95d5d] bg-[#fff8f7]"}`} onClick={() => openMessage(item)}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e6eef2] text-xs font-extrabold text-[#18324a]">{(item.sender || "?").slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${item.is_read ? "font-semibold text-[#304654]" : "font-extrabold text-[#18324a]"}`}>{item.sender || item.recipients.join(", ") || "Unknown sender"}</span><span className="shrink-0 text-[10px] text-[#94a1a8]">{formatDate(item.received_at || item.sent_at)}</span></span><span className={`mt-1 block truncate text-sm ${item.is_read ? "text-[#71818a]" : "font-semibold text-[#405560]"}`}>{thread.subject || "(no subject)"}</span><span className="mt-1 block truncate text-xs text-[#9aa7ad]">{item.text_body || "No message preview"}</span></span></button>; })}</div> : <div className="p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf3f5] text-xl text-[#81919c]">✉</div><p className="mt-4 font-bold text-[#304654]">No messages here</p><p className="mt-1 text-sm leading-6 text-[#81919c]">Sync your inbox or compose a new email.</p></div>}
          </div>
        </section>
        <section className="hidden min-w-0 bg-[#fbfcfc] lg:block">
          {selectedMessage ? <div className="h-full"><div className="flex items-center justify-between border-b border-[#e3e8eb] bg-white px-6 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Message</p><h2 className="mt-1 text-xl font-extrabold text-[#18324a]">{selectedMessage.subject || "(no subject)"}</h2></div><button className="grid h-9 w-9 place-items-center rounded-lg text-[#81919c] hover:bg-[#f0f5f7]" onClick={() => setSelectedMessage(null)} aria-label="Close message">×</button></div><div className="border-b border-[#e3e8eb] px-6 py-5"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#18324a] text-sm font-extrabold text-white">{(selectedMessage.sender || "?").slice(0, 1).toUpperCase()}</span><div><p className="font-bold text-[#304654]">{selectedMessage.sender || "Unknown sender"}</p><p className="mt-1 text-xs text-[#8998a1]">To: {selectedMessage.recipients.join(", ") || mailbox?.email_address}</p><p className="mt-1 text-xs text-[#8998a1]">{formatDate(selectedMessage.received_at || selectedMessage.sent_at)}</p></div></div></div><div className="max-h-[480px] overflow-y-auto px-6 py-7"><p className="whitespace-pre-wrap text-[15px] leading-8 text-[#425762]">{selectedMessage.text_body || "This message has no plain-text body."}</p></div></div> : <div className="grid h-full place-items-center p-10 text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[#edf3f5] text-2xl text-[#8da0aa]">✉</div><p className="mt-5 text-lg font-extrabold text-[#304654]">Select a message</p><p className="mt-2 max-w-xs text-sm leading-6 text-[#81919c]">Choose a conversation from your inbox to read it here.</p></div></div>}
        </section>
      </div>
    </div>

    {selectedMessage ? <Modal open={true} onClose={() => setSelectedMessage(null)} title={selectedMessage.subject || "(no subject)"} description={`${selectedMessage.sender || "Unknown sender"} · ${formatDate(selectedMessage.received_at || selectedMessage.sent_at)}`}><div className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-7">{selectedMessage.text_body || "This message has no plain-text body."}</div></Modal> : null}
    <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Compose email" description={`Send from ${mailbox?.email_address || "this mailbox"}`}><form className="space-y-4" onSubmit={sendEmail}><Field label="To"><TextInput required value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="recipient@example.com" /></Field><Field label="Cc"><TextInput value={compose.cc} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} placeholder="Optional, comma-separated" /></Field><Field label="Subject"><TextInput required value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="Subject" /></Field><Field label="Message"><textarea required className="min-h-44 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" value={compose.text} onChange={(event) => setCompose({ ...compose, text: event.target.value })} placeholder="Write your email..." /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button><Button type="submit" loading={sending}>Send email</Button></div></form></Modal>
  </>;
}
