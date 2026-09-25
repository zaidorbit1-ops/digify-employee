"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Alert } from "@/components/ui/empty-state";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

/* ==========================================================================
   Types
   ========================================================================== */
type EmailAttachment = {
  id?: number;
  file_name: string;
  content_type?: string | null;
  storage_path?: string | null;
  file_size?: number | null;
};

type UploadingAttachment = {
  name: string;
  size: number;
  type: string;
  base64: string;
};

type Message = {
  id: number;
  thread_id?: number;
  sender: string | null;
  recipients: string[];
  cc?: string[];
  subject: string | null;
  text_body: string | null;
  html_body?: string | null;
  is_read: boolean;
  received_at: string | null;
  sent_at: string | null;
  crm_email_attachments?: EmailAttachment[];
};

type Thread = {
  id: number;
  subject: string | null;
  folder: string;
  is_starred: boolean;
  updated_at: string;
  crm_email_messages: Message[];
};

type Mailbox = {
  id: number;
  company_id: number;
  email_address: string;
  display_name: string;
  status: string;
};

/* ==========================================================================
   Constants & Data
   ========================================================================== */
const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: "📥", badgeTone: "bg-primary text-white" },
  { id: "starred", label: "Starred", icon: "⭐", badgeTone: "bg-amber-400 text-amber-950" },
  { id: "sent", label: "Sent", icon: "📤", badgeTone: "bg-emerald-500 text-white" },
  { id: "drafts", label: "Drafts", icon: "📝", badgeTone: "bg-slate-500 text-white" },
  { id: "archive", label: "Archive", icon: "🗄️", badgeTone: "bg-slate-400 text-white" },
  { id: "spam", label: "Spam", icon: "⚠️", badgeTone: "bg-orange-500 text-white" },
  { id: "trash", label: "Trash", icon: "🗑️", badgeTone: "bg-rose-500 text-white" },
] as const;

const EMOJI_CATEGORIES = [
  {
    name: "Smiles & People",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","🥲","🥹","😊","😇","🙂","🙃","😉","😌",
      "😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸",
      "🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","😣","😖","😫","😩","🥺","😢","😭",
      "😮‍💨","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔",
      "🫣","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴",
    ],
  },
  {
    name: "Gestures & Body",
    icon: "👍",
    emojis: [
      "👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","👋","🤚","🖐️",
      "✋","🖖","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","✌️","🤞","🫰","🤌","🤏",
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓",
    ],
  },
  {
    name: "Office & Work",
    icon: "💼",
    emojis: [
      "💼","📁","📂","🗂️","📅","📆","📋","📊","📈","📉","📜","📑","📌","📍","📎","🖇️",
      "📏","📐","✂️","🖊️","🖋️","✒️","📝","✏️","🔍","🔎","🔒","🔓","🔏","🔐","🔑","✉️",
      "📧","📨","📩","📤","📥","📦","📫","📪","🚀","⚡","🔥","💡","⭐","🌟","✨","🎯",
      "✅","❌","❓","❗","💯","🏆","🥇","🔔","🔕","⚙️","🛠️","💻","🖥️","📱","📞","☎️",
    ],
  },
];

const TEXT_COLORS = [
  { name: "Black", color: "#111827" },
  { name: "Slate", color: "#475569" },
  { name: "Primary Red", color: "#e45a5a" },
  { name: "Orange", color: "#ea580c" },
  { name: "Amber", color: "#d97706" },
  { name: "Emerald", color: "#059669" },
  { name: "Blue", color: "#2563eb" },
  { name: "Indigo", color: "#4f46e5" },
  { name: "Purple", color: "#7c3aed" },
  { name: "Pink", color: "#db2777" },
];

const HIGHLIGHT_COLORS = [
  { name: "None", color: "transparent" },
  { name: "Soft Red", color: "#fdecec" },
  { name: "Yellow", color: "#fef08a" },
  { name: "Green", color: "#bbf7d0" },
  { name: "Blue", color: "#bfdbfe" },
  { name: "Pink", color: "#fbcfe8" },
  { name: "Purple", color: "#e9d5ff" },
  { name: "Orange", color: "#fed7aa" },
];

/* ==========================================================================
   Utilities
   ========================================================================== */
function formatSmartDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isThisYear) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

function formatFullDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["pdf"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return "📝";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  return "📎";
}

function getSenderName(sender: string | null): string {
  if (!sender) return "Unknown sender";
  const emailMatch = sender.match(/^(.*?)\s*<.*?>$/);
  if (emailMatch && emailMatch[1].trim()) {
    return emailMatch[1].replace(/["']/g, "").trim();
  }
  return sender.split("@")[0] || sender;
}

function getSenderEmail(sender: string | null): string {
  if (!sender) return "";
  const emailMatch = sender.match(/<(.*?)>/);
  if (emailMatch) return emailMatch[1];
  return sender;
}

function getInitials(nameOrEmail: string | null): string {
  if (!nameOrEmail) return "?";
  const cleaned = nameOrEmail.replace(/<.*?>/, "").trim();
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (cleaned[0] || "?").toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "bg-primary", text: "text-white" },
  { bg: "bg-slate-800", text: "text-white" },
  { bg: "bg-indigo-600", text: "text-white" },
  { bg: "bg-sky-600", text: "text-white" },
  { bg: "bg-emerald-600", text: "text-white" },
  { bg: "bg-amber-600", text: "text-white" },
  { bg: "bg-rose-600", text: "text-white" },
  { bg: "bg-violet-600", text: "text-white" },
];

function getAvatarStyle(str: string | null) {
  if (!str) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function SenderAvatar({ sender, className }: { sender: string | null; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const email = getSenderEmail(sender).trim().toLowerCase();
  const avatarStyle = getAvatarStyle(sender);

  return (
    <div className={`${className} relative overflow-hidden ${avatarStyle.bg} ${avatarStyle.text}`}>
      {!imageFailed && email ? (
        <img
          src={`https://unavatar.io/${encodeURIComponent(email)}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {(imageFailed || !email) && (
        <span className="relative z-10">{getInitials(sender)}</span>
      )}
    </div>
  );
}

/* ==========================================================================
   Rich Text Compose Toolbar
   ========================================================================== */
function RichTextToolbar({
  onInsertEmoji,
  editorRef,
  onAttachClick,
}: {
  onInsertEmoji: (emoji: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onAttachClick: () => void;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const exec = (command: string, value: string | undefined = undefined) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handleInsertLink = () => {
    if (linkUrl && linkUrl !== "https://") {
      exec("createLink", linkUrl);
      setLinkUrl("https://");
    }
    setLinkInputOpen(false);
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/90 px-3 py-1.5 backdrop-blur">
      {/* Font Size */}
      <select
        onChange={(e) => exec("fontSize", e.target.value)}
        defaultValue="3"
        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-primary"
        title="Font Size"
      >
        <option value="1">Tiny</option>
        <option value="2">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
        <option value="5">Huge</option>
      </select>

      <div className="mx-1 h-4 w-px bg-slate-200" />

      {/* Basic Formatting */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
        title="Bold (Ctrl+B)"
        className="flex h-7 w-7 items-center justify-center rounded-lg font-bold text-slate-700 transition hover:bg-slate-200"
      >
        B
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}
        title="Italic (Ctrl+I)"
        className="flex h-7 w-7 items-center justify-center rounded-lg font-serif italic text-slate-700 transition hover:bg-slate-200"
      >
        I
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}
        title="Underline (Ctrl+U)"
        className="flex h-7 w-7 items-center justify-center rounded-lg underline text-slate-700 transition hover:bg-slate-200"
      >
        U
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough"); }}
        title="Strikethrough"
        className="flex h-7 w-7 items-center justify-center rounded-lg line-through text-slate-700 transition hover:bg-slate-200 text-xs font-bold"
      >
        S
      </button>

      <div className="mx-1 h-4 w-px bg-slate-200" />

      {/* Text Color Picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setColorMenuOpen(!colorMenuOpen);
            setHighlightMenuOpen(false);
            setEmojiOpen(false);
          }}
          title="Text Color"
          className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
        >
          <span className="flex flex-col items-center">
            <span>A</span>
            <span className="h-0.5 w-3 rounded-full bg-primary" />
          </span>
          <span className="text-[9px] text-slate-400">▾</span>
        </button>

        {colorMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 grid w-48 grid-cols-5 gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  exec("foreColor", c.color);
                  setColorMenuOpen(false);
                }}
                title={c.name}
                className="h-6 w-6 rounded-full border border-slate-200 transition hover:scale-125 focus:ring-2 focus:ring-primary"
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight Color Picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setHighlightMenuOpen(!highlightMenuOpen);
            setColorMenuOpen(false);
            setEmojiOpen(false);
          }}
          title="Highlight Color"
          className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
        >
          <span className="rounded bg-primary-soft text-primary px-1 py-0.5 text-[10px] font-bold">H</span>
          <span className="text-[9px] text-slate-400">▾</span>
        </button>

        {highlightMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex w-44 flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  exec("hiliteColor", c.color);
                  setHighlightMenuOpen(false);
                }}
                title={c.name}
                className="h-6 w-6 rounded-lg border border-slate-300 transition hover:scale-125"
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mx-1 h-4 w-px bg-slate-200" />

      {/* Alignments */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }}
        title="Align Left"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-xs text-slate-700 transition hover:bg-slate-200"
      >
        ⇠
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }}
        title="Align Center"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-xs text-slate-700 transition hover:bg-slate-200"
      >
        ≡
      </button>

      {/* Lists */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}
        title="Bullet List"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-slate-700 transition hover:bg-slate-200"
      >
        •—
      </button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}
        title="Numbered List"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-slate-700 transition hover:bg-slate-200"
      >
        1.
      </button>

      {/* Link */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setLinkInputOpen(!linkInputOpen)}
          title="Insert Link"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-700 transition hover:bg-slate-200"
        >
          🔗
        </button>

        {linkInputOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex w-64 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleInsertLink}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-primary-hover"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Emoji Picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setEmojiOpen(!emojiOpen);
            setColorMenuOpen(false);
            setHighlightMenuOpen(false);
          }}
          title="Insert Emoji"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition hover:bg-slate-200 hover:scale-110 active:scale-95"
        >
          😊
        </button>

        {emojiOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-100">
            <div className="flex border-b border-slate-100 bg-slate-50 px-2 py-1">
              {EMOJI_CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setEmojiTab(idx)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    emojiTab === idx
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="hidden sm:inline">{cat.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>

            <div className="max-h-52 overflow-y-auto p-2.5">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_CATEGORIES[emojiTab].emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onInsertEmoji(emoji);
                      setEmojiOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-primary-soft hover:scale-125 active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-1 h-4 w-px bg-slate-200" />

      {/* Attach Files Button */}
      <button
        type="button"
        onClick={onAttachClick}
        title="Attach Files (Images, PDF, Docs)"
        className="flex h-7 items-center gap-1 rounded-lg bg-primary-soft px-2.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
      >
        <span>📎</span>
        <span>Attach</span>
      </button>

      {/* Clear Formatting */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); }}
        title="Clear Formatting"
        className="ml-auto flex h-7 items-center rounded-lg px-2 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
      >
        Clear
      </button>
    </div>
  );
}

/* ==========================================================================
   Docked Floating Compose Drawer with Attachments
   ========================================================================== */
function ComposeDrawer({
  mailbox,
  initialTo = "",
  initialSubject = "",
  onClose,
  onSent,
}: {
  mailbox: Mailbox | null;
  initialTo?: string;
  initialSubject?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attachments State
  const [attachments, setAttachments] = useState<UploadingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleInsertEmoji = (emoji: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("insertText", false, emoji);
  };

  const handleFileAttach = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      // 15MB limit check per file
      if (file.size > 15 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 15MB size limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileAttach(e.dataTransfer.files);
    }
  };

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!to.trim()) {
      setError("Please specify at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Please enter an email subject.");
      return;
    }
    const htmlContent = editorRef.current?.innerHTML ?? "";
    const textContent = editorRef.current?.innerText ?? "";
    if (!textContent.trim() && !htmlContent.trim() && attachments.length === 0) {
      setError("Please enter a message body or attach a file.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/crm/webmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox_id: mailbox?.id,
          action: "send",
          to,
          cc: cc.trim() || undefined,
          subject,
          text: textContent,
          html: htmlContent,
          attachments,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to send email.");
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`fixed z-50 flex flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl transition-all duration-200 ${
        maximized
          ? "inset-4 rounded-2xl md:inset-10"
          : minimized
          ? "bottom-0 right-6 w-80 rounded-t-2xl shadow-lg"
          : "bottom-0 right-6 w-[640px] max-w-[calc(100vw-2rem)] rounded-t-2xl max-h-[85vh]"
      } ${isDragging ? "ring-4 ring-primary ring-offset-2" : ""}`}
    >
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFileAttach(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="flex h-2 w-2 rounded-full bg-primary" />
          <span className="truncate text-sm font-semibold tracking-wide">
            {subject || "New Message"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized(!minimized)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            title={minimized ? "Restore" : "Minimize"}
          >
            {minimized ? "▢" : "—"}
          </button>
          {!minimized && (
            <button
              type="button"
              onClick={() => setMaximized(!maximized)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white text-xs"
              title={maximized ? "Exit Fullscreen" : "Fullscreen"}
            >
              {maximized ? "⧉" : "⛶"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white text-lg"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <form onSubmit={handleSend} onKeyDown={handleKeyDown} className="flex flex-1 flex-col overflow-hidden">
          {/* Email Headers Form */}
          <div className="divide-y divide-slate-100 bg-white">
            <div className="flex items-center px-4 py-2 text-xs">
              <span className="w-16 font-semibold text-slate-400">From:</span>
              <span className="font-semibold text-slate-800">{mailbox?.email_address}</span>
            </div>

            <div className="flex items-center px-4 py-2">
              <span className="w-16 text-xs font-semibold text-slate-400">To:</span>
              <input
                required
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com (comma separated)"
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
              />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {showCc && (
              <div className="flex items-center px-4 py-2 animate-in fade-in">
                <span className="w-16 text-xs font-semibold text-slate-400">Cc:</span>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>
            )}

            {showBcc && (
              <div className="flex items-center px-4 py-2 animate-in fade-in">
                <span className="w-16 text-xs font-semibold text-slate-400">Bcc:</span>
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>
            )}

            <div className="flex items-center px-4 py-2.5">
              <span className="w-16 text-xs font-semibold text-slate-400">Subject:</span>
              <input
                required
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this email about?"
                className="flex-1 bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Rich Editor Toolbar */}
          <RichTextToolbar
            onInsertEmoji={handleInsertEmoji}
            editorRef={editorRef}
            onAttachClick={() => fileInputRef.current?.click()}
          />

          {/* Editable Content Area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Write your email here... Drag and drop files to attach."
            className="compose-body-editor flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-7 text-slate-800 outline-none"
            style={{ minHeight: maximized ? "360px" : "200px" }}
          />

          {/* Attachments Chips List */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm"
                >
                  <span>{getFileIcon(att.name)}</span>
                  <span className="max-w-[160px] truncate font-semibold text-slate-700">
                    {att.name}
                  </span>
                  <span className="text-[10px] text-slate-400">({formatFileSize(att.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-hover active:scale-95 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <span className="animate-spin text-base">🔄</span>
                    <span>Sending email…</span>
                  </>
                ) : (
                  <>
                    <span>Send</span>
                    <span className="text-xs opacity-90">🚀</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <span>📎</span>
                <span>Attach Files</span>
              </button>
              <span className="hidden text-[11px] text-slate-400 sm:inline">Ctrl+Enter to send</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
              title="Discard draft"
            >
              🗑️
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ==========================================================================
   Master Email Reader (Viewing Experience with Attachments)
   ========================================================================== */
function EmailReaderView({
  thread,
  mailbox,
  onClose,
  onReply,
  onMessageSent,
  onToggleStar,
  onMoveFolder,
  onDelete,
}: {
  thread: Thread;
  mailbox: Mailbox | null;
  onClose: () => void;
  onReply: (recipient: string, subject: string) => void;
  onMessageSent: () => Promise<void>;
  onToggleStar: (threadId: number, current: boolean) => void;
  onMoveFolder: (threadId: number, folder: string) => void;
  onDelete: (threadId: number) => void;
}) {
  const [viewMode, setViewMode] = useState<"html" | "text">("html");
  const [showHeaders, setShowHeaders] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<UploadingAttachment[]>([]);
  const [sendingQuickReply, setSendingQuickReply] = useState(false);
  const [quickReplySuccess, setQuickReplySuccess] = useState(false);

  const messages = thread.crm_email_messages || [];
  const latestMessage = messages[messages.length - 1];

  if (!latestMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
        <span className="text-4xl">📭</span>
        <p className="mt-2 text-sm font-medium">No messages found in this conversation.</p>
      </div>
    );
  }

  const senderName = getSenderName(latestMessage.sender);
  const senderEmail = getSenderEmail(latestMessage.sender);
  const dateFormatted = formatFullDate(latestMessage.received_at || latestMessage.sent_at);

  // Attachments collected from messages in thread
  const allAttachments = messages.flatMap((m) => m.crm_email_attachments || []);

  const handleReplyFileAttach = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (file.size > 15 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setReplyAttachments((current) => [
          ...current,
          { name: file.name, size: file.size, type: file.type || "application/octet-stream", base64 },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleQuickReplySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickReplyText.trim() && replyAttachments.length === 0) return;
    setSendingQuickReply(true);

    try {
      const repTo = senderEmail || latestMessage.sender || "";
      const repSubject = thread.subject?.startsWith("Re:")
        ? thread.subject
        : `Re: ${thread.subject || "(no subject)"}`;

      const response = await fetch("/api/crm/webmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox_id: mailbox?.id,
          action: "send",
          thread_id: thread.id,
          to: repTo,
          subject: repSubject,
          text: quickReplyText,
          html: `<p>${quickReplyText.replace(/\n/g, "<br/>")}</p>`,
          attachments: replyAttachments,
        }),
      });
      if (!response.ok) throw new Error("Failed to send reply.");
      setQuickReplyText("");
      setReplyAttachments([]);
      await onMessageSent();
      setQuickReplySuccess(true);
      setTimeout(() => setQuickReplySuccess(false), 4000);
    } catch {
      alert("Failed to send quick reply.");
    } finally {
      setSendingQuickReply(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
            title="Back to inbox"
          >
            ←
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => onToggleStar(thread.id, thread.is_starred)}
            className={`flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-slate-200 ${
              thread.is_starred ? "text-amber-500" : "text-slate-400 hover:text-amber-500"
            }`}
            title={thread.is_starred ? "Unstar" : "Star"}
          >
            {thread.is_starred ? "⭐" : "☆"}
          </button>
          <button
            type="button"
            onClick={() => onMoveFolder(thread.id, "archive")}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
            title="Move to Archive"
          >
            🗄️
          </button>
          <button
            type="button"
            onClick={() => onMoveFolder(thread.id, "spam")}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
            title="Report Spam"
          >
            ⚠️
          </button>
          {thread.folder === "trash" ? (
            <>
              <button
                type="button"
                onClick={() => onMoveFolder(thread.id, "inbox")}
                className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                title="Restore to Inbox"
              >
                ↩ Restore
              </button>
              <button
                type="button"
                onClick={() => onDelete(thread.id)}
                className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                title="Delete permanently"
              >
                🗑 Delete forever
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onMoveFolder(thread.id, "trash")}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              title="Delete / Move to Trash"
            >
              🗑️
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {latestMessage.html_body && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode("html")}
                className={`rounded-md px-2.5 py-1 transition ${
                  viewMode === "html" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => setViewMode("text")}
                className={`rounded-md px-2.5 py-1 transition ${
                  viewMode === "text" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Plain Text
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onReply(senderEmail || latestMessage.sender || "", thread.subject || "")}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
          >
            <span>↩</span>
            <span>Reply</span>
          </button>
        </div>
      </div>

      {/* Subject Line & Tags */}
      <div className="border-b border-slate-100 px-8 py-5">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">
            {thread.subject || "(No Subject)"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              Folder: {thread.folder}
            </span>
            {thread.is_starred && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                Starred
              </span>
            )}
            {allAttachments.length > 0 && (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">
                📎 {allAttachments.length} Attachment{allAttachments.length === 1 ? "" : "s"}
              </span>
            )}
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              TLS Encrypted
            </span>
          </div>
        </div>
      </div>

      {/* Sender Profile Card */}
      <div className="border-b border-slate-100 bg-slate-50/40 px-8 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <SenderAvatar sender={latestMessage.sender} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{senderName}</span>
                <span className="text-xs text-slate-400">&lt;{senderEmail}&gt;</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <span>To: {latestMessage.recipients?.join(", ") || mailbox?.email_address}</span>
                <button
                  type="button"
                  onClick={() => setShowHeaders(!showHeaders)}
                  className="rounded text-[11px] font-semibold text-primary hover:underline"
                >
                  {showHeaders ? "Hide details" : "Show details"}
                </button>
              </div>
            </div>
          </div>

          <div className="text-right text-xs text-slate-400">
            <span>{dateFormatted}</span>
          </div>
        </div>

        {/* Collapsible Full Headers */}
        {showHeaders && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600 shadow-sm animate-in fade-in">
            <div className="grid grid-cols-[80px_1fr] gap-1.5">
              <span className="font-semibold text-slate-400">From:</span>
              <span className="font-mono text-slate-800">{latestMessage.sender}</span>
              <span className="font-semibold text-slate-400">To:</span>
              <span className="font-mono text-slate-800">{latestMessage.recipients?.join(", ")}</span>
              {latestMessage.cc && latestMessage.cc.length > 0 && (
                <>
                  <span className="font-semibold text-slate-400">Cc:</span>
                  <span className="font-mono text-slate-800">{latestMessage.cc.join(", ")}</span>
                </>
              )}
              <span className="font-semibold text-slate-400">Date:</span>
              <span>{dateFormatted}</span>
              <span className="font-semibold text-slate-400">Security:</span>
              <span className="text-emerald-600 font-medium">🔒 Standard encryption (TLS)</span>
            </div>
          </div>
        )}
      </div>

      {/* Attachments Section in Reader */}
      {allAttachments.length > 0 && (
        <div className="border-b border-slate-200 bg-amber-50/40 px-8 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📎</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Attachments ({allAttachments.length})
              </span>
            </div>
            <span className="text-[11px] text-slate-500">Download files</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {allAttachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-xl">{getFileIcon(att.file_name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800" title={att.file_name}>
                      {att.file_name}
                    </p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(att.file_size)}</p>
                  </div>
                </div>
                {att.storage_path && (
                  <a
                    href={att.storage_path}
                    download={att.file_name}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-hover"
                    title="Download attachment"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Email Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-5">
          {messages.map((message, index) => {
            const messageSender = getSenderName(message.sender);
            const messageEmail = getSenderEmail(message.sender);
            const messageDate = formatFullDate(message.received_at || message.sent_at);
            return (
              <article key={message.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-slate-900">{messageSender}</span>
                    <span className="text-xs text-slate-400">&lt;{messageEmail}&gt;</span>
                    {index === messages.length - 1 && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">Latest</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{messageDate}</span>
                </div>
                <div className="p-5">
                  {viewMode === "html" && message.html_body ? (
                    <div className="w-full rounded-xl border border-slate-100 bg-white p-2">
                      <iframe
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <style>
                              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.65; color: #1e293b; margin: 16px; padding: 0; }
                              a { color: #e45a5a; }
                              img { max-width: 100%; height: auto; border-radius: 8px; }
                              blockquote { border-left: 3px solid #e2e8f0; margin-left: 0; padding-left: 12px; color: #64748b; }
                            </style>
                          </head>
                          <body>${message.html_body}</body>
                          </html>
                        `}
                        onLoad={(event) => {
                          const body = event.currentTarget.contentDocument?.body;
                          if (body) event.currentTarget.style.height = `${Math.max(180, body.scrollHeight + 32)}px`;
                        }}
                        className="block w-full border-0"
                        sandbox="allow-same-origin allow-popups"
                        title={`Email message ${index + 1}`}
                      />
                    </div>
                  ) : (
                    <div className="max-w-4xl whitespace-pre-wrap font-sans text-[15px] leading-8 text-slate-800">
                      {message.text_body || (
                        <span className="italic text-slate-400">This message has no plain text content.</span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

      </div>

      {/* Quick Inline Reply Card at Bottom */}
      <div className="border-t border-slate-200 bg-slate-50/80 p-6">
        {quickReplySuccess && (
          <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            ✓ Quick reply sent successfully!
          </div>
        )}
        <form onSubmit={handleQuickReplySubmit} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span className="font-semibold">Quick Reply to:</span>
            <span className="font-medium text-slate-800">{senderName}</span>
          </div>
          <textarea
            rows={3}
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            placeholder="Write a quick reply..."
            className="w-full resize-none p-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {replyAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-2">
              {replyAttachments.map((attachment, index) => (
                <span key={`${attachment.name}-${index}`} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  📎 {attachment.name}
                  <button
                    type="button"
                    onClick={() => setReplyAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="font-bold text-slate-400 hover:text-rose-500"
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <input
                id={`reply-attachment-${thread.id}`}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleReplyFileAttach(event.target.files);
                  event.target.value = "";
                }}
              />
              <label htmlFor={`reply-attachment-${thread.id}`} className="cursor-pointer text-xs font-bold text-primary hover:underline">
                Attach file 📎
              </label>
              <button
                type="button"
                onClick={() => onReply(senderEmail || latestMessage.sender || "", thread.subject || "")}
                className="text-xs font-bold text-primary hover:underline"
              >
                Full composer ↗
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onReply("", `Fwd: ${thread.subject || "(no subject)"}`)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Forward
              </button>
              <button
                type="submit"
                disabled={sendingQuickReply || (!quickReplyText.trim() && replyAttachments.length === 0)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-hover disabled:opacity-50"
              >
                {sendingQuickReply ? "Sending…" : "Send Reply 🚀"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   Main Webmail Workspace Component
   ========================================================================== */
export default function MailboxWorkspace() {
  const params = useParams<{ mailboxId: string }>();
  const mailboxId = Number(params.mailboxId);

  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  // Compose Drawer State
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitialTo, setComposeInitialTo] = useState("");
  const [composeInitialSubject, setComposeInitialSubject] = useState("");

  // Load Mailbox Data
  async function loadMailbox(page = 1, append = false) {
    if (append) setLoadingMoreThreads(true);
    else setLoading(true);
    try {
      const response = await fetch(`/api/crm/webmail?mailbox_id=${mailboxId}&page=${page}&limit=10`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load mailbox.");
      setMailbox(result.mailbox);
      setThreads((current) => append ? [...current, ...(result.threads ?? [])] : (result.threads ?? []));
      setHasMoreThreads(Boolean(result.hasMore));
    } catch (error) {
      setNotification({
        text: error instanceof Error ? error.message : "Could not load mailbox.",
        tone: "danger",
      });
    } finally {
      if (append) setLoadingMoreThreads(false);
      else setLoading(false);
    }
  }

  // Reload threads silently without page flicker
  async function reloadThreadsSilently() {
    try {
      const latestTimestamp = threads.reduce((latest, thread) => {
        return thread.updated_at > latest ? thread.updated_at : latest;
      }, "1970-01-01T00:00:00.000Z");
      const response = await fetch(
        `/api/crm/webmail?mailbox_id=${mailboxId}&since=${encodeURIComponent(latestTimestamp)}`,
        { cache: "no-store" }
      );
      const result = await response.json();
      if (response.ok && result.threads) {
        setThreads((current) => {
          const incomingById = new Map<number, Thread>(result.threads.map((thread: Thread) => [thread.id, thread]));
          const merged = current.map((thread) => incomingById.get(thread.id) ?? thread);
          const existingIds = new Set(current.map((thread) => thread.id));
          return [
            ...merged,
            ...result.threads.filter((thread: Thread) => !existingIds.has(thread.id)),
          ].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
        });
      }
    } catch {
      // silent ignore
    }
  }

  async function refreshCurrentThread() {
    await reloadThreadsSilently();
    if (!selectedThreadId) return;
    try {
      const response = await fetch(`/api/crm/webmail?mailbox_id=${mailboxId}&thread_id=${selectedThreadId}`, { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.threads?.[0]) {
        setThreads((current) => current.map((thread) => thread.id === selectedThreadId ? result.threads[0] : thread));
      }
    } catch {
      // The sent message is still persisted even if the refresh is delayed.
    }
  }

  // Initial load
  useEffect(() => {
    if (Number.isInteger(mailboxId) && mailboxId > 0) {
      loadMailbox();
    }
  }, [mailboxId]);

  // Supabase Realtime Channel
  useEffect(() => {
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const channel = supabase
        .channel(`webmail-live-${mailboxId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "crm_email_threads",
            filter: `mailbox_id=eq.${mailboxId}`,
          },
          () => {
            reloadThreadsSilently();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "crm_email_messages",
            filter: `mailbox_id=eq.${mailboxId}`,
          },
          () => {
            reloadThreadsSilently();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // ignore
    }
  }, [mailboxId]);

  // Open Message & Mark Read
  async function handleSelectThread(thread: Thread) {
    setSelectedThreadId(thread.id);
    let selectedThread = thread;
    try {
      const response = await fetch(`/api/crm/webmail?mailbox_id=${mailboxId}&thread_id=${thread.id}`, { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.threads?.[0]) {
        selectedThread = result.threads[0];
        setThreads((current) => current.map((item) => item.id === selectedThread.id ? selectedThread : item));
      }
    } catch {
      // Keep the summary view if the detail request fails.
    }
    const unreadMessages = selectedThread.crm_email_messages.filter((m) => !m.is_read);
    if (unreadMessages.length > 0) {
      setThreads((current) =>
        current.map((t) =>
          t.id === selectedThread.id
            ? {
                ...t,
                crm_email_messages: t.crm_email_messages.map((m) => ({ ...m, is_read: true })),
              }
            : t
        )
      );
      for (const msg of unreadMessages) {
        await fetch("/api/crm/webmail", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: msg.id, is_read: true }),
        });
      }
    }
  }

  // Toggle Star
  async function handleToggleStar(threadId: number, currentStar: boolean) {
    const nextStar = !currentStar;
    setThreads((current) =>
      current.map((t) => (t.id === threadId ? { ...t, is_starred: nextStar } : t))
    );
    await fetch("/api/crm/webmail", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, is_starred: nextStar }),
    });
  }

  // Move Folder
  async function handleMoveFolder(threadId: number, newFolder: string) {
    setThreads((current) =>
      current.map((t) => (t.id === threadId ? { ...t, folder: newFolder } : t))
    );
    const response = await fetch("/api/crm/webmail", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, folder: newFolder }),
    });
    if (!response.ok) {
      setNotification({ text: "Email folder update failed.", tone: "danger" });
      await loadMailbox();
      return;
    }
    setSelectedFolder(newFolder);
    setNotification({
      text: newFolder === "trash" ? "Email moved to Trash." : "Email restored to Inbox.",
      tone: "success",
    });
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  }

  async function handleDeleteThread(threadId: number) {
    if (!window.confirm("Delete this conversation permanently? This cannot be undone.")) return;
    const response = await fetch("/api/crm/webmail", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, permanent_delete: true }),
    });
    if (!response.ok) {
      setNotification({ text: "Could not permanently delete this conversation.", tone: "danger" });
      return;
    }
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
    setSelectedThreadId(null);
    setNotification({ text: "Conversation permanently deleted.", tone: "success" });
  }

  // Filtered Threads
  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchesFolder =
        selectedFolder === "starred"
          ? thread.is_starred
          : thread.folder === selectedFolder;

      if (!matchesFolder) return false;

      if (filterUnreadOnly) {
        const hasUnread = thread.crm_email_messages.some((m) => !m.is_read);
        if (!hasUnread) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const latest = thread.crm_email_messages.at(-1);
        const haystack = `${thread.subject ?? ""} ${latest?.sender ?? ""} ${latest?.text_body ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [threads, selectedFolder, filterUnreadOnly, searchQuery]);

  const selectedThread = useMemo(() => {
    return threads.find((t) => t.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  const inboxUnreadCount = useMemo(() => {
    return threads.filter((t) => t.folder === "inbox" && t.crm_email_messages.some((m) => !m.is_read))
      .length;
  }, [threads]);

  const starredCount = useMemo(() => {
    return threads.filter((t) => t.is_starred).length;
  }, [threads]);

  return (
    <>
      <style>{`
        .compose-body-editor:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedThreadId ? (
            <button
              type="button"
              onClick={() => setSelectedThreadId(null)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary/40 hover:text-primary"
              title="Back to emails"
            >
              ←
            </button>
          ) : (
            <Link
              href="/dashboard/crm/webmail"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary/40 hover:text-primary"
              title="Back to Mailbox Directory"
            >
              ←
            </Link>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
                CRM Mailbox
              </span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">
              {mailbox?.display_name || mailbox?.email_address || "Loading Mailbox..."}
            </h1>
            <p className="text-xs text-slate-500">{mailbox?.email_address}</p>
          </div>
          {mailbox?.status && (
            <span
              className={`ml-2 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                mailbox.status === "connected"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200"
              }`}
            >
              {mailbox.status === "connected" ? "🟢 Connected" : "🟡 Pending"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setComposeInitialTo("");
              setComposeInitialSubject("");
              setComposeOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-hover active:scale-95"
          >
            <span>✏️</span>
            <span>Compose</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="mb-4">
          <Alert tone={notification.tone}>{notification.text}</Alert>
        </div>
      )}

      {/* Main 3-Column Workstation */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className={`grid min-h-[780px] ${selectedThreadId ? "lg:grid-cols-1" : "lg:grid-cols-[230px_minmax(330px,0.78fr)_minmax(380px,1.22fr)]"}`}>

          {/* ════════════ Column 1: Left Navigation ════════════ */}
          <aside className={`${selectedThreadId ? "hidden" : ""} border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r`}>
            <button
              type="button"
              onClick={() => {
                setComposeInitialTo("");
                setComposeInitialSubject("");
                setComposeOpen(true);
              }}
              className="mb-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-hover active:scale-95"
            >
              <span>✏️</span>
              <span>Compose Email</span>
            </button>

            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Folders
            </div>
            <nav className="space-y-1">
              {FOLDERS.map((f) => {
                const isActive = selectedFolder === f.id;
                let badgeCount = 0;
                if (f.id === "inbox") badgeCount = inboxUnreadCount;
                if (f.id === "starred") badgeCount = starredCount;

                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelectedFolder(f.id);
                      setSelectedThreadId(null);
                    }}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                      isActive
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-base">{f.icon}</span>
                      <span>{f.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${f.badgeTone}`}>
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Status Widget */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Mailbox Status
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-slate-800">
                {mailbox?.status === "connected" ? "Connected & Ready" : "Sync Required"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Encrypted via TLS on server.
              </p>
            </div>
          </aside>

          {/* ════════════ Column 2: Conversation Thread List ════════════ */}
          <section className={`${selectedThreadId ? "hidden" : ""} flex flex-col border-b border-slate-200 bg-white lg:border-b-0 lg:border-r`}>
            <div className="border-b border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900 capitalize">
                    {selectedFolder}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {visibleThreads.length} conversation{visibleThreads.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      filterUnreadOnly
                        ? "bg-primary text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Unread only
                  </button>
                  <button
                    type="button"
                    onClick={() => loadMailbox()}
                    className="rounded-lg p-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Refresh"
                  >
                    🔄
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  🔍
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sender, subject, text…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Threads List Items */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex animate-pulse gap-3 p-2">
                      <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/3 rounded bg-slate-100" />
                        <div className="h-3 w-3/4 rounded bg-slate-100" />
                        <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleThreads.length > 0 ? (
                visibleThreads.map((thread) => {
                  const latest = thread.crm_email_messages.at(-1);
                  const isSelected = selectedThreadId === thread.id;
                  const isUnread = latest ? !latest.is_read : false;
                  const senderName = getSenderName(latest?.sender ?? "");
                  const dateText = formatSmartDate(latest?.received_at || latest?.sent_at);
                  const hasAttachments = thread.crm_email_messages.some(
                    (m) => m.crm_email_attachments && m.crm_email_attachments.length > 0
                  );

                  return (
                    <div
                      key={thread.id}
                      onClick={() => handleSelectThread(thread)}
                      className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition select-none ${
                        isSelected
                          ? "bg-primary-soft/50"
                          : isUnread
                          ? "bg-primary-soft/20 hover:bg-primary-soft/30"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* Active Indicator */}
                      {isUnread && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                      )}

                      {/* Avatar */}
                      <SenderAvatar sender={latest?.sender ?? null} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black shadow-sm" />

                      {/* Content preview */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm ${
                              isUnread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"
                            }`}
                          >
                            {senderName}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-slate-400">
                            {dateText}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasAttachments && (
                            <span className="text-xs text-primary" title="Contains attachments">
                              📎
                            </span>
                          )}
                          <span
                            className={`truncate text-[13px] ${
                              isUnread ? "font-bold text-slate-900" : "font-medium text-slate-600"
                            }`}
                          >
                            {thread.subject || "(no subject)"}
                          </span>
                        </div>

                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          {latest?.text_body || "No preview content"}
                        </p>
                      </div>

                      {/* Star Button */}
                      <div className="flex shrink-0 items-center gap-1 self-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStar(thread.id, thread.is_starred);
                          }}
                          className={`p-1 text-sm transition hover:scale-125 ${
                            thread.is_starred
                              ? "text-amber-500"
                              : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500"
                          }`}
                          title={thread.is_starred ? "Unstar" : "Star"}
                        >
                          {thread.is_starred ? "⭐" : "☆"}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-3xl">
                    ✉️
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-800">No emails here</h3>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">
                    {searchQuery
                      ? "No conversations match your search terms."
                      : "No messages found in this folder."}
                  </p>
                </div>
              )}
              {!loading && visibleThreads.length > 0 && hasMoreThreads && (
                <div className="border-t border-slate-100 p-3 text-center">
                  <button
                    type="button"
                    onClick={() => loadMailbox(Math.floor(threads.length / 10) + 1, true)}
                    disabled={loadingMoreThreads}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {loadingMoreThreads ? "Loading…" : "Load 10 more emails"}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ════════════ Column 3: Full Interactive Email Reader ════════════ */}
          <section className={`${selectedThreadId ? "block" : "hidden lg:block"} min-w-0 bg-white`}>
            {selectedThread ? (
              <EmailReaderView
                thread={selectedThread}
                mailbox={mailbox}
                onClose={() => setSelectedThreadId(null)}
                onReply={(repTo, repSub) => {
                  setComposeInitialTo(repTo);
                  setComposeInitialSubject(repSub.startsWith("Re:") ? repSub : `Re: ${repSub}`);
                  setComposeOpen(true);
                }}
                onMessageSent={refreshCurrentThread}
                onToggleStar={handleToggleStar}
                onMoveFolder={handleMoveFolder}
                onDelete={handleDeleteThread}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-12 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary-soft text-5xl shadow-inner">
                  📬
                </div>
                <h3 className="mt-6 text-xl font-black text-slate-800">Select an email to read</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Pick any message from the conversation list on the left, or compose a brand-new email with attachments.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setComposeInitialTo("");
                    setComposeInitialSubject("");
                    setComposeOpen(true);
                  }}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-hover active:scale-95"
                >
                  <span>✏️</span>
                  <span>Compose New Email</span>
                </button>
              </div>
            )}
          </section>

        </div>
      </div>

      {/* Floating Compose Drawer with Attachments */}
      {composeOpen && (
        <ComposeDrawer
          mailbox={mailbox}
          initialTo={composeInitialTo}
          initialSubject={composeInitialSubject}
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setNotification({ text: "Email sent successfully! 🚀", tone: "success" });
            loadMailbox();
          }}
        />
      )}
    </>
  );
}
