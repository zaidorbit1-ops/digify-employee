"use client";

import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  IconAlert,
  IconArrowRight,
  IconBriefcase,
  IconCalendar,
  IconCheck,
  IconClose,
  IconClock,
  IconEmployees,
  IconHistory,
  IconPlus,
  IconSearch,
  IconUser,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type TaskStatus = "todo" | "in_progress" | "approved" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type ViewMode = "assigned" | "personal" | "all";
type LayoutMode = "board" | "calendar";
type StatusFilter = "all" | TaskStatus;
const TASKS_PER_PAGE = 10;

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  creator_user_id: string;
  creator_name?: string | null;
  assignee_user_id: string | null;
  assignee_name?: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type Employee = {
  id: number;
  name?: string | null;
  full_name?: string | null;
  auth_user_id?: string | null;
};

type TaskActivity = {
  id: number;
  actor_user_id: string;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  assignee_names: Record<string, string>;
  created_at: string;
};

const statuses: TaskStatus[] = ["todo", "in_progress", "approved", "done"];

const statusStyle: Record<TaskStatus, { label: string; color: string; dot: string; column: string; card: string }> = {
  todo: {
    label: "To do",
    color: "bg-slate-200 text-slate-800",
    dot: "bg-slate-500",
    column: "border-slate-300 bg-slate-100",
    card: "border-l-slate-500 bg-gradient-to-r from-slate-50 to-white",
  },
  in_progress: {
    label: "In progress",
    color: "bg-sky-100 text-sky-900",
    dot: "bg-sky-600",
    column: "border-sky-300 bg-sky-100/80",
    card: "border-l-sky-500 bg-gradient-to-r from-sky-50 to-white",
  },
  approved: {
    label: "Approved",
    color: "bg-violet-100 text-violet-900",
    dot: "bg-violet-600",
    column: "border-violet-300 bg-violet-100/80",
    card: "border-l-violet-500 bg-gradient-to-r from-violet-50 to-white",
  },
  done: {
    label: "Done",
    color: "bg-emerald-100 text-emerald-900",
    dot: "bg-emerald-600",
    column: "border-emerald-300 bg-emerald-100/80",
    card: "border-l-emerald-500 bg-gradient-to-r from-emerald-50 to-white",
  },
};

const priorityStyle: Record<TaskPriority, string> = {
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  high: "bg-orange-50 text-orange-800 ring-orange-200",
  urgent: "bg-rose-50 text-rose-800 ring-rose-200",
};

const emptyForm = {
  title: "",
  description: "",
  status: "todo" as TaskStatus,
  priority: "medium" as TaskPriority,
  due_at: "",
  assignee_user_id: "",
};

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDueToday(task: Task) {
  return Boolean(task.due_at && dateKey(new Date(task.due_at)) === dateKey(new Date()));
}

function isOverdue(task: Task) {
  if (!task.due_at || task.status === "done") return false;
  const dueDate = new Date(task.due_at);
  const today = new Date();
  dueDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function statusLabel(status: string) {
  return statusStyle[status as TaskStatus]?.label ?? status.replaceAll("_", " ");
}

function historyFieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    due_at: "Due date",
    assignee_user_id: "Assignee",
  };
  return labels[field] ?? field.replaceAll("_", " ");
}

function displayHistoryValue(value: unknown) {
  if (value === null || value === "") return "None";
  if (typeof value === "string") {
    if (["todo", "in_progress", "approved", "done"].includes(value)) return statusLabel(value);
    if (value.includes("T") && !Number.isNaN(Date.parse(value))) return formatDate(value);
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function TasksPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "superadmin";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [view, setView] = useState<ViewMode>("personal");
  const [layout, setLayout] = useState<LayoutMode>("board");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => dateKey(new Date()));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ text: string; danger?: boolean } | null>(null);

  async function loadTasks() {
    const response = await fetch("/api/tasks", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load tasks.");
    setTasks(Array.isArray(result.tasks) ? result.tasks : []);
  }

  async function loadEmployees() {
    if (!isAdmin) return;
    const response = await fetch("/api/employees", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load employees.");
    const list: Employee[] = Array.isArray(result.employees) ? result.employees : [];
    setEmployees(list.filter((employee) => Boolean(employee.auth_user_id)));
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([loadTasks(), loadEmployees()])
      .catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load the board.", danger: true }))
      .finally(() => setLoading(false));
  }, [user?.id, isAdmin]);

  const visibleTasks = useMemo(() => {
    if (!user) return [];
    const byView = tasks.filter((task) => {
      if (view === "personal") return task.creator_user_id === user.id && !task.assignee_user_id;
      if (view === "all") {
        return isAdmin
          ? task.creator_user_id === user.id
          : (task.creator_user_id === user.id && !task.assignee_user_id)
            || (task.assignee_user_id === user.id && task.creator_user_id !== user.id);
      }
      if (isAdmin) return task.creator_user_id === user.id && Boolean(task.assignee_user_id);
      return task.assignee_user_id === user.id && task.creator_user_id !== user.id;
    });
    const normalizedQuery = search.trim().toLowerCase();
    return byView.filter((task) => {
      if (!normalizedQuery) return true;
      return `${task.title} ${task.description ?? ""} ${task.assignee_name ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    }).sort((left, right) => {
      if (!left.due_at && !right.due_at) return 0;
      if (!left.due_at) return 1;
      if (!right.due_at) return -1;
      return new Date(left.due_at).getTime() - new Date(right.due_at).getTime();
    });
  }, [tasks, user, view, isAdmin, search]);

  const filteredTasks = useMemo(
    () => statusFilter === "all" ? visibleTasks : visibleTasks.filter((task) => task.status === statusFilter),
    [visibleTasks, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PER_PAGE));
  const pageTasks = filteredTasks.slice((currentPage - 1) * TASKS_PER_PAGE, currentPage * TASKS_PER_PAGE);
  const pageStart = filteredTasks.length ? (currentPage - 1) * TASKS_PER_PAGE + 1 : 0;
  const pageEnd = Math.min(currentPage * TASKS_PER_PAGE, filteredTasks.length);
  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + index,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [view, search, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const overdueCount = filteredTasks.filter(isOverdue).length;
  const openCount = filteredTasks.filter((task) => task.status !== "done").length;
  const doneCount = filteredTasks.filter((task) => task.status === "done").length;
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarMonth]);
  const calendarTasksByDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    filteredTasks.forEach((task) => {
      if (!task.due_at) return;
      const key = dateKey(new Date(task.due_at));
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    });
    return grouped;
  }, [filteredTasks]);
  const monthTasks = useMemo(
    () => filteredTasks.filter((task) => task.due_at && new Date(task.due_at).getFullYear() === calendarMonth.getFullYear() && new Date(task.due_at).getMonth() === calendarMonth.getMonth()),
    [filteredTasks, calendarMonth],
  );
  const selectedDayTasks = calendarTasksByDay.get(selectedCalendarDay) ?? [];
  const unplannedTasks = filteredTasks.filter((task) => !task.due_at && task.status !== "done");
  const taskCountForView = (tab: ViewMode) => {
    if (!user) return 0;
    return tasks.filter((task) => {
      if (tab === "personal") return task.creator_user_id === user.id && !task.assignee_user_id;
      if (tab === "all") {
        return isAdmin
          ? task.creator_user_id === user.id
          : (task.creator_user_id === user.id && !task.assignee_user_id)
            || (task.assignee_user_id === user.id && task.creator_user_id !== user.id);
      }
      return isAdmin
        ? task.creator_user_id === user.id && Boolean(task.assignee_user_id)
        : task.assignee_user_id === user.id && task.creator_user_id !== user.id;
    }).length;
  };

  function openCreate() {
    setEditingTaskId(null);
    setForm(emptyForm);
    setMessage(null);
    setShowForm(true);
  }

  async function openDetails(task: Task) {
    setSelectedTask(task);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/history`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load task history.");
      setHistory(Array.isArray(result.history) ? result.history : []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load task history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openEdit(task: Task) {
    setSelectedTask(null);
    setEditingTaskId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      due_at: task.due_at ? new Date(task.due_at).toISOString().slice(0, 10) : "",
      assignee_user_id: task.assignee_user_id ?? "",
    });
    setMessage(null);
    setShowForm(true);
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/tasks", {
        method: editingTaskId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTaskId ?? undefined,
          title: form.title,
          description: form.description,
          status: form.status,
          priority: form.priority,
          due_at: form.due_at || null,
          assignee_user_id: isAdmin ? form.assignee_user_id || null : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save task.");
      setShowForm(false);
      setMessage({ text: editingTaskId ? "Task updated." : "Task created." });
      await loadTasks();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save task.", danger: true });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(taskId: number, status: TaskStatus) {
    const previousTasks = tasks;
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Status update failed.");
      await loadTasks();
      setSelectedTask((current) => current?.id === taskId ? { ...current, status } : current);
      setMessage({ text: "Task status updated." });
    } catch (error) {
      setTasks(previousTasks);
      setMessage({ text: error instanceof Error ? error.message : "Status update failed.", danger: true });
    }
  }

  async function archiveTask(taskId: number) {
    try {
      const response = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not archive task.");
      setSelectedTask(null);
      await loadTasks();
      setMessage({ text: "Task archived." });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not archive task.", danger: true });
    }
  }

  function handleDrop(taskId: number, status: TaskStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (task && task.status !== status) void updateStatus(taskId, status);
    setDraggedTaskId(null);
  }

  const viewTabs = isAdmin
    ? [
        { id: "assigned" as const, label: "Assigned by me", icon: IconEmployees },
        { id: "personal" as const, label: "My personal tasks", icon: IconBriefcase },
        { id: "all" as const, label: "All tasks", icon: IconCheck },
      ]
    : [
        { id: "assigned" as const, label: "Assigned to me", icon: IconEmployees },
        { id: "personal" as const, label: "My personal tasks", icon: IconBriefcase },
        { id: "all" as const, label: "All tasks", icon: IconCheck },
      ];

  return (
    <>
      <PageHeader
        eyebrow="Team task management"
        title="Tasks & Projects"
        description="Keep assigned work and your personal tasks separate, with clear ownership and a complete activity trail."
        actions={
          <Button onClick={openCreate} className="rounded-xl bg-[#242047] shadow-[0_10px_25px_rgba(36,32,71,0.2)] hover:bg-[#302b5c]">
            <IconPlus className="h-4 w-4" />
            Create task
          </Button>
        }
      />

      {message ? (
        <div className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${message.danger ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <span>{message.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setMessage(null)} className="rounded-md p-1 hover:bg-black/5">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e7f0] bg-white p-4 shadow-[0_8px_28px_rgba(34,31,66,0.04)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0efff] text-[#6255d7]"><IconBriefcase className="h-5 w-5" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open work</p><p className="mt-0.5 text-2xl font-bold text-[#242047]">{openCount}</p></div>
          </div>
        </div>
        <div className="rounded-2xl border border-[#e8e7f0] bg-white p-4 shadow-[0_8px_28px_rgba(34,31,66,0.04)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f8f1] text-[#16875b]"><IconCheck className="h-5 w-5" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</p><p className="mt-0.5 text-2xl font-bold text-[#242047]">{doneCount}</p></div>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 shadow-[0_8px_28px_rgba(34,31,66,0.04)] ${overdueCount ? "border-rose-200 bg-rose-50" : "border-[#e8e7f0] bg-white"}`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${overdueCount ? "bg-rose-100 text-rose-700" : "bg-[#fff4e8] text-[#d97706]"}`}><IconAlert className="h-5 w-5" /></span>
            <div><p className={`text-xs font-semibold uppercase tracking-wide ${overdueCount ? "text-rose-700" : "text-slate-500"}`}>Overdue</p><p className={`mt-0.5 text-2xl font-bold ${overdueCount ? "text-rose-800" : "text-[#242047]"}`}>{overdueCount}</p></div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e7e6ee] bg-white shadow-[0_12px_40px_rgba(34,31,66,0.05)]">
        <div className="flex flex-col gap-4 border-b border-[#efeff4] bg-[#fcfcfe] p-4 sm:p-5">
          <div>
            <h2 className="text-base font-bold text-[#242047]">Your work, clearly separated</h2>
            <p className="mt-1 text-xs text-slate-500">Personal tasks are only tasks you created without assigning to someone else.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
            <div className="grid w-full min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-[#dedee9] bg-[#ececf3] p-1">
              {viewTabs.map((tab) => {
                const TabIcon = tab.icon;
                const activeColor = tab.id === "assigned"
                  ? "bg-[#293064] text-white shadow-[0_3px_10px_rgba(41,48,100,0.24)]"
                  : tab.id === "personal"
                    ? "bg-[#6848c7] text-white shadow-[0_3px_10px_rgba(104,72,199,0.22)]"
                    : "bg-[#087e8b] text-white shadow-[0_3px_10px_rgba(8,126,139,0.22)]";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setView(tab.id)}
                    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 py-2.5 text-[11px] font-bold transition sm:gap-2 sm:px-2 sm:text-xs ${view === tab.id ? `${activeColor} border-transparent` : "border-transparent bg-transparent text-slate-700 hover:border-slate-300 hover:bg-white"}`}
                  >
                    <TabIcon className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${view === tab.id ? "text-white" : tab.id === "assigned" ? "text-[#38458f]" : tab.id === "personal" ? "text-[#6848c7]" : "text-[#087e8b]"}`} />
                    <span className="min-w-0 truncate">{tab.label}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${view === tab.id ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>
                      {taskCountForView(tab.id)}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="relative block w-full xl:w-60 xl:flex-none">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                className="h-10 w-full rounded-xl border border-[#e5e5ed] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#8175e8] focus:ring-4 focus:ring-[#8175e8]/10"
              />
            </label>
            <div className="grid grid-cols-2 rounded-xl border border-[#dedee9] bg-white p-1 xl:flex-none">
              <button
                type="button"
                onClick={() => setLayout("board")}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${layout === "board" ? "bg-[#293064] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setLayout("calendar")}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${layout === "calendar" ? "bg-[#087e8b] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <span className="inline-flex items-center justify-center gap-1.5"><IconCalendar className="h-4 w-4" /> View calendar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#efeff4] bg-white px-4 py-3 sm:px-5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</span>
          {(["all", ...statuses] as StatusFilter[]).map((status) => {
            const count = status === "all"
              ? visibleTasks.length
              : visibleTasks.filter((task) => task.status === status).length;
            const label = status === "all" ? "All" : statusStyle[status].label;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${statusFilter === status ? status === "all" ? "border-[#293064] bg-[#293064] text-white shadow-sm" : `${statusStyle[status].color} border-current shadow-sm` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                {label}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusFilter === status ? "bg-white/20 text-inherit" : "bg-slate-100 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
            {statuses.map((status) => <div key={status} className="h-64 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : layout === "calendar" ? (
          <div className="bg-[#f8f9fc] p-3 sm:p-5">
            <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-[#e5e7f0] bg-white p-4 shadow-[0_8px_28px_rgba(34,31,66,0.04)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#087e8b]">Task schedule</p>
                <h3 className="mt-1 text-xl font-bold tracking-tight text-[#242047]">
                  {calendarMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
                </h3>
                <p className="mt-1 text-xs text-slate-500">{monthTasks.length} due {monthTasks.length === 1 ? "task" : "tasks"} this month</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                    setSelectedCalendarDay(dateKey(today));
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-[#087e8b]/40 hover:bg-[#ecfeff] hover:text-[#087e8b]"
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => {
                    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
                    setCalendarMonth(nextMonth);
                    setSelectedCalendarDay(dateKey(nextMonth));
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                >
                  <IconArrowRight className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => {
                    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
                    setCalendarMonth(nextMonth);
                    setSelectedCalendarDay(dateKey(nextMonth));
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                >
                  <IconArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="overflow-hidden rounded-2xl border border-[#e1e4ed] bg-white shadow-[0_8px_28px_rgba(34,31,66,0.04)]">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-[#f4f6fa]">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="px-1 py-3 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-500 sm:px-2 sm:text-xs">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarDays.map((day) => {
                    const key = dateKey(day);
                    const dayTasks = calendarTasksByDay.get(key) ?? [];
                    const inMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = key === dateKey(new Date());
                    const isSelected = key === selectedCalendarDay;
                    return (
                      <div
                        key={key}
                        role="group"
                        aria-label={day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        onClick={() => setSelectedCalendarDay(key)}
                        className={`min-h-[92px] cursor-pointer border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-[128px] sm:p-2 ${inMonth ? "bg-white" : "bg-slate-50/80"} ${isSelected ? "bg-[#effcfd] ring-2 ring-inset ring-[#087e8b]/45" : "hover:bg-slate-50"}`}
                      >
                        <button
                          type="button"
                          aria-label={`Select ${day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedCalendarDay(key)}
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold sm:h-7 sm:min-w-7 sm:text-xs ${isToday ? "bg-[#087e8b] text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}
                        >
                          {day.getDate()}
                        </button>
                        <div className="mt-1 space-y-1">
                          {dayTasks.slice(0, 2).map((task) => (
                            <button
                              key={task.id}
                              onClick={(event) => { event.stopPropagation(); void openDetails(task); }}
                              className={`block w-full truncate rounded-md border-l-2 px-1.5 py-1 text-left text-[9px] font-bold leading-3 sm:px-2 sm:text-[10px] ${isOverdue(task) ? "border-rose-600 bg-rose-100 text-rose-800" : isDueToday(task) ? "border-amber-600 bg-amber-100 text-amber-900" : task.status === "done" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : task.status === "in_progress" ? "border-sky-500 bg-sky-50 text-sky-800" : task.status === "approved" ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-400 bg-slate-100 text-slate-700"}`}
                            >
                              {task.title}
                            </button>
                          ))}
                          {dayTasks.length > 2 ? <span className="block px-1 text-[9px] font-bold text-slate-500 sm:px-2">+{dayTasks.length - 2} more</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-[#d8eaed] bg-gradient-to-br from-[#ecfeff] via-white to-[#f5f3ff] p-4 shadow-[0_8px_28px_rgba(34,31,66,0.04)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#087e8b]">Selected day</p>
                  <h4 className="mt-1 text-lg font-bold text-[#242047]">
                    {new Date(`${selectedCalendarDay}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">{selectedDayTasks.length} scheduled {selectedDayTasks.length === 1 ? "task" : "tasks"}</p>
                  <div className="mt-4 space-y-2">
                    {selectedDayTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => void openDetails(task)}
                        className={`w-full rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${isOverdue(task) ? "border-rose-200" : "border-slate-200"}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold leading-5 text-[#242047]">{task.title}</span>
                          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isOverdue(task) ? "bg-rose-500" : isDueToday(task) ? "bg-amber-500" : statusStyle[task.status].dot}`} />
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span className={`rounded-md px-1.5 py-1 text-[9px] font-bold ${statusStyle[task.status].color}`}>{statusStyle[task.status].label}</span>
                          <span className="truncate text-[10px] text-slate-500">{isAdmin && task.assignee_name ? `To: ${task.assignee_name}` : task.assignee_name ?? "Personal"}</span>
                        </span>
                      </button>
                    ))}
                    {selectedDayTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#b9dfe2] bg-white/70 px-3 py-5 text-center">
                        <IconCalendar className="mx-auto h-5 w-5 text-[#087e8b]/60" />
                        <p className="mt-2 text-xs font-semibold text-slate-600">A clear day</p>
                        <p className="mt-1 text-[10px] text-slate-400">No tasks are due on this date.</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">No due date</p>
                      <p className="mt-1 text-xs text-amber-900/70">{unplannedTasks.length} open {unplannedTasks.length === 1 ? "task" : "tasks"} to schedule</p>
                    </div>
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700"><IconClock className="h-4 w-4" /></span>
                  </div>
                  {unplannedTasks.length ? (
                    <div className="mt-3 space-y-1.5">
                      {unplannedTasks.slice(0, 4).map((task) => (
                        <button key={task.id} type="button" onClick={() => void openDetails(task)} className="block w-full truncate rounded-lg bg-white/80 px-2.5 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-white">
                          {task.title}
                        </button>
                      ))}
                      {unplannedTasks.length > 4 ? <p className="px-1 text-[10px] font-semibold text-amber-800">and {unplannedTasks.length - 4} more</p> : null}
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
            {statuses.map((status) => {
              const columnTasks = pageTasks.filter((task) => task.status === status);
              return (
                <section
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => draggedTaskId !== null && handleDrop(draggedTaskId, status)}
                  className={`min-h-[360px] rounded-xl border p-2.5 ${statusStyle[status].column}`}
                >
                  <header className="mb-3 flex items-center justify-between px-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${statusStyle[status].dot}`} />
                      <h3 className="text-sm font-bold text-[#282644]">{statusStyle[status].label}</h3>
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">{columnTasks.length}</span>
                    </div>
                    {status === "todo" ? (
                      <button type="button" onClick={openCreate} aria-label="Add task" className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-[#6255d7]">
                        <IconPlus className="h-4 w-4" />
                      </button>
                    ) : null}
                  </header>

                  <div className="space-y-2.5">
                    {columnTasks.map((task) => {
                      const overdue = isOverdue(task);
                      const dueToday = isDueToday(task);
                      return (
                        <article
                          key={task.id}
                          draggable
                          onDragStart={(event: DragEvent<HTMLElement>) => {
                            event.dataTransfer.effectAllowed = "move";
                            setDraggedTaskId(task.id);
                          }}
                          onDragEnd={() => setDraggedTaskId(null)}
                          onClick={() => void openDetails(task)}
                          className={`group cursor-pointer rounded-xl border border-l-4 p-3.5 shadow-[0_5px_16px_rgba(30,31,55,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(30,31,55,0.1)] ${overdue ? "border-rose-300 border-l-rose-600 bg-gradient-to-r from-rose-100 to-white ring-1 ring-rose-100" : dueToday ? "border-amber-300 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white ring-1 ring-amber-100" : statusStyle[task.status].card}`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${priorityStyle[task.priority]}`}>{task.priority}</span>
                            {overdue ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                                <IconAlert className="h-3 w-3" /> Overdue
                              </span>
                            ) : dueToday ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                                <IconCalendar className="h-3 w-3" /> Due today
                              </span>
                            ) : null}
                          </div>
                          <h4 className="text-sm font-bold leading-5 text-[#262443]">{task.title}</h4>
                          {task.description ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</p> : null}

                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 text-slate-500">
                              <IconCalendar className={`h-3.5 w-3.5 ${overdue ? "text-rose-600" : "text-slate-400"}`} />
                              <span className={overdue ? "font-semibold text-rose-700" : dueToday ? "font-bold text-amber-800" : ""}>{dueToday ? `Today · ${formatDate(task.due_at)}` : formatDate(task.due_at)}</span>
                            </span>
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-600" title={view === "assigned" && isAdmin ? `Assigned to ${task.assignee_name ?? "employee"}` : undefined}>
                              {view === "assigned" && isAdmin ? <IconEmployees className="h-3.5 w-3.5 shrink-0 text-[#7065d8]" /> : <IconUser className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                              <span className="truncate">{view === "assigned" && isAdmin ? `To: ${task.assignee_name ?? "Employee"}` : isAdmin ? "Created by you" : `From: ${task.creator_name ?? "Admin"}`}</span>
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${statusStyle[task.status].color}`}>{statusStyle[task.status].label}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 transition group-hover:text-[#6255d7]">
                              <IconHistory className="h-3.5 w-3.5" /> History
                            </span>
                          </div>
                        </article>
                      );
                    })}
                    {columnTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white/55 px-3 py-8 text-center">
                        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400"><IconBriefcase className="h-4 w-4" /></span>
                        <p className="mt-2 text-xs font-semibold text-slate-500">Nothing here yet</p>
                        <p className="mt-1 text-[11px] text-slate-400">Drop a task here or create one.</p>
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {!loading && layout === "board" ? (
          <footer className="flex flex-col gap-3 border-t border-[#e7e6ee] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs font-medium text-slate-500">
              Showing <span className="font-bold text-slate-700">{pageStart}–{pageEnd}</span> of{" "}
              <span className="font-bold text-slate-700">{filteredTasks.length}</span> tasks
              <span className="ml-1 text-slate-400">(10 per page)</span>
            </p>
            <nav aria-label="Task pages" className="flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? "page" : undefined}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition ${currentPage === page ? "bg-[#293064] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          </footer>
        ) : null}
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-50 bg-[#15142a]/45 backdrop-blur-[3px]" onClick={() => setShowForm(false)}>
          <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7065d8]">{editingTaskId ? "Task editor" : view === "personal" ? "Personal task" : "Team assignment"}</p>
                <h2 className="mt-1 text-xl font-bold text-[#242047]">{editingTaskId ? "Update task" : "Create a task"}</h2>
                <p className="mt-1 text-xs text-slate-500">{isAdmin ? "Assign it to an employee or leave unassigned for your personal list." : "This task will be saved to your personal task list."}</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><IconClose className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveTask} className="space-y-5 px-6 py-6">
              <Field label="Task title">
                <TextInput required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to get done?" />
              </Field>
              <Field label="Details">
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#8175e8] focus:ring-4 focus:ring-[#8175e8]/10"
                  placeholder="Add instructions, context, or expected outcome..."
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priority">
                  <SelectInput value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </SelectInput>
                </Field>
                <Field label="Status">
                  <SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}>
                    {statuses.map((status) => <option key={status} value={status}>{statusStyle[status].label}</option>)}
                  </SelectInput>
                </Field>
              </div>
              <div className={`grid gap-4 ${isAdmin ? "sm:grid-cols-2" : ""}`}>
                <Field label="Due date">
                  <TextInput type="date" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} />
                </Field>
                {isAdmin ? (
                  <Field label="Assign to">
                    <SelectInput value={form.assignee_user_id} onChange={(event) => setForm({ ...form, assignee_user_id: event.target.value })}>
                      <option value="">No one — keep personal</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.auth_user_id ?? ""}>
                          {employee.full_name ?? employee.name ?? `Employee ${employee.id}`}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                ) : null}
              </div>
              <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
                <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" loading={saving} className="bg-[#28244f] hover:bg-[#393367]">{editingTaskId ? "Save changes" : "Create task"}</Button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {selectedTask ? (
        <div className="fixed inset-0 z-50 bg-[#15142a]/45 backdrop-blur-[3px]" onClick={() => setSelectedTask(null)}>
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div className="min-w-0 pr-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7065d8]">Task details</p>
                <h2 className="mt-1 break-words text-xl font-bold text-[#242047]">{selectedTask.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedTask(null)} aria-label="Close task details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><IconClose className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${statusStyle[selectedTask.status].color}`}>{statusStyle[selectedTask.status].label}</span>
                <span className={`rounded-md px-2.5 py-1.5 text-xs font-bold uppercase ring-1 ring-inset ${priorityStyle[selectedTask.priority]}`}>{selectedTask.priority}</span>
                {isOverdue(selectedTask) ? <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white"><IconAlert className="h-3.5 w-3.5" /> Overdue</span> : null}
                {!isOverdue(selectedTask) && isDueToday(selectedTask) ? <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white"><IconCalendar className="h-3.5 w-3.5" /> Due today</span> : null}
              </div>
              {selectedTask.description ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedTask.description}</p> : <p className="text-sm italic text-slate-400">No task details added.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Due date</p>
                  <p className={`mt-1.5 flex items-center gap-2 text-sm font-semibold ${isOverdue(selectedTask) ? "text-rose-700" : "text-slate-700"}`}>
                    {isOverdue(selectedTask) ? <IconAlert className="h-4 w-4" /> : <IconCalendar className="h-4 w-4" />}
                    {formatDate(selectedTask.due_at)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{selectedTask.assignee_user_id ? "Assigned to" : "Task type"}</p>
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    {selectedTask.assignee_user_id ? <><IconEmployees className="h-4 w-4 text-[#7065d8]" />{selectedTask.assignee_name ?? "Employee"}</> : <><IconBriefcase className="h-4 w-4 text-[#7065d8]" />Personal</>}
                  </p>
                </div>
              </div>

              {selectedTask.assignee_user_id && isAdmin && selectedTask.creator_user_id === user?.id ? (
                <div className="flex flex-wrap gap-2">
                  {statuses.map((status) => (
                    <button key={status} type="button" onClick={() => void updateStatus(selectedTask.id, status)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${selectedTask.status === status ? statusStyle[status].color : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {statusStyle[status].label}
                    </button>
                  ))}
                </div>
              ) : null}

              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#242047]"><IconHistory className="h-4 w-4 text-[#7065d8]" />Activity history</h3>
                    <p className="mt-1 text-xs text-slate-500">Every recorded update, assignment, and status change.</p>
                  </div>
                  {history.length ? <span className="rounded-full bg-[#f0efff] px-2.5 py-1 text-[10px] font-bold text-[#6255d7]">{history.length} events</span> : null}
                </div>
                {historyLoading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading history...</p> : null}
                {historyError ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{historyError}</p> : null}
                {!historyLoading && !historyError && history.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No activity has been recorded for this task yet.</p> : null}
                <ol className="space-y-0">
                  {history.map((entry) => {
                    const changes = (entry.details.changes ?? {}) as Record<string, unknown>;
                    const previous = (entry.details.previous ?? {}) as Record<string, unknown>;
                    const changeEntries = Object.entries(changes).filter(([field]) => !["updated_at", "completed_at"].includes(field));
                    const createdEntries = entry.action === "task_created"
                      ? Object.entries(entry.details).filter(([field]) => ["status", "priority", "assignee_user_id"].includes(field))
                      : [];
                    const actionLabel = entry.action === "task_created" ? "created this task" : entry.action === "task_archived" ? "archived this task" : "updated this task";
                    const getHistoryValue = (field: string, value: unknown) => field === "assignee_user_id"
                      ? value ? entry.assignee_names[String(value)] ?? "Employee" : "Unassigned"
                      : displayHistoryValue(value);
                    return (
                      <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                        <span className="absolute bottom-0 left-[13px] top-7 w-px bg-slate-200 last:hidden" />
                        <span className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.action === "task_created" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                          {entry.action === "task_created" ? <IconPlus className="h-3.5 w-3.5" /> : entry.action === "task_archived" ? <IconAlert className="h-3.5 w-3.5" /> : <IconClock className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <p className="text-xs text-slate-700"><span className="font-bold">{entry.actor_name}</span> {actionLabel}</p>
                            <time className="text-[10px] text-slate-400">{formatDate(entry.created_at, true)}</time>
                          </div>
                          {changeEntries.length ? (
                            <div className="mt-2 space-y-1.5">
                              {changeEntries.map(([field, value]) => {
                                return (
                                  <p key={field} className="break-words text-[11px] text-slate-500">
                                    <span className="font-semibold text-slate-600">{historyFieldLabel(field)}:</span> {previous[field] !== undefined ? `${getHistoryValue(field, previous[field])} → ` : ""}{getHistoryValue(field, value)}
                                  </p>
                                );
                              })}
                            </div>
                          ) : null}
                          {createdEntries.length ? (
                            <div className="mt-2 space-y-1.5">
                              {createdEntries.map(([field, value]) => (
                                <p key={field} className="break-words text-[11px] text-slate-500">
                                  <span className="font-semibold text-slate-600">{historyFieldLabel(field)}:</span> {getHistoryValue(field, value)}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
              <span className="text-[11px] text-slate-400">Created {formatDate(selectedTask.created_at)}</span>
              <div className="flex gap-2">
                {selectedTask.creator_user_id === user?.id ? (
                  <Button variant="secondary" onClick={() => openEdit(selectedTask)}>Edit task</Button>
                ) : null}
                {selectedTask.creator_user_id === user?.id || isAdmin ? (
                  <Button variant="secondary" onClick={() => void archiveTask(selectedTask.id)} className="border-rose-200 text-rose-700 hover:bg-rose-50">Archive</Button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
