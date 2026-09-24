"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconAttendance,
  IconBell,
  IconClose,
  IconDevices,
  IconEmployees,
  IconLists,
  IconOverview,
  IconCalendar,
  IconSalary,
  IconBriefcase,
  IconWallet,
  IconSettings,
  IconFile,
  IconRefresh,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: IconOverview },
  { label: "Devices", href: "/dashboard/devices", icon: IconDevices },
  { label: "Employees", href: "/dashboard/employees", icon: IconEmployees },
  { label: "Attendance", href: "/dashboard/attendance", icon: IconAttendance },
  { label: "Notes & Reminders", href: "/dashboard/notes", icon: IconBell },
  { label: "Internal Chat", href: "/dashboard/internal-chat", icon: IconBell },
  { label: "Leave", href: "/dashboard/leave", icon: IconCalendar },
  { label: "Holidays", href: "/dashboard/holidays", icon: IconCalendar },
  { label: "Salary", href: "/dashboard/salary", icon: IconSalary },
  {
    label: "Company accounts",
    href: "/dashboard/company-accounts",
    icon: IconBriefcase,
  },
  { label: "Payment tracking", href: "/dashboard/payments", icon: IconWallet },
  { label: "Settings", href: "/dashboard/settings", icon: IconSettings },
  { label: "Lookup lists", href: "/dashboard/lookups", icon: IconLists },
];

const crmNavItems = [
  { label: "CRM Overview", href: "/dashboard/crm", icon: IconOverview },
  { label: "Companies", href: "/dashboard/crm/companies", icon: IconBriefcase },
  { label: "Custom fields", href: "/dashboard/crm/custom-fields", icon: IconLists },
  { label: "Leads", href: "/dashboard/crm/leads", icon: IconEmployees },
  { label: "Experts", href: "/dashboard/crm/experts", icon: IconEmployees },
  { label: "Orders", href: "/dashboard/crm/orders", icon: IconWallet },
  { label: "Contacts", href: "/dashboard/crm/contacts", icon: IconEmployees },
  { label: "Segments", href: "/dashboard/crm/segments", icon: IconLists },
  { label: "Webmail", href: "/dashboard/crm/webmail", icon: IconBell },
  { label: "Email Templates", href: "/dashboard/crm/templates", icon: IconFile },
  { label: "Campaigns", href: "/dashboard/crm/campaigns", icon: IconWallet },
  { label: "Automations", href: "/dashboard/crm/automations", icon: IconRefresh },
  { label: "Analytics", href: "/dashboard/crm/analytics", icon: IconOverview },
  { label: "CRM Settings", href: "/dashboard/crm/settings", icon: IconSettings },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { profile, user, signOut } = useAuth();
  const [grantedModules, setGrantedModules] = useState<string[]>([]);
  const [pendingNotes, setPendingNotes] = useState(0);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWindowWheel = (event: WheelEvent) => {
      const sidebar = sidebarRef.current;
      const el = sidebarScrollRef.current;
      if (!sidebar || !el) return;

      const target = event.target;
      if (!(target instanceof Node) || !sidebar.contains(target)) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      const atTop = el.scrollTop <= 0 && event.deltaY < 0;
      const atBottom = el.scrollTop >= maxScroll - 1 && event.deltaY > 0;
      if (atTop || atBottom) return;

      event.preventDefault();
      el.scrollTop = Math.min(Math.max(el.scrollTop + event.deltaY, 0), maxScroll);
    };

    window.addEventListener("wheel", handleWindowWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWindowWheel);
  }, []);

  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) =>
        setGrantedModules(
          (result.permissions ?? []).map(
            (permission: { module: string }) => permission.module,
          ),
        ),
      )
      .catch(() => setGrantedModules([]));
  }, [profile?.role]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function loadPendingNotes() {
      try {
        const response = await fetch("/api/notes", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (mounted) setPendingNotes((result.notes ?? []).filter((note: { completed_at?: string | null }) => !note.completed_at).length);
      } catch {
        if (mounted) setPendingNotes(0);
      }
    }
    loadPendingNotes();
    const timer = window.setInterval(loadPendingNotes, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [user, pathname]);

  useEffect(() => {
    function closeWorkspaceMenu(event: MouseEvent) {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) setWorkspaceMenuOpen(false);
    }
    document.addEventListener("mousedown", closeWorkspaceMenu);
    return () => document.removeEventListener("mousedown", closeWorkspaceMenu);
  }, []);

  const moduleForHref: Record<string, string> = {
    "/dashboard/devices": "devices",
    "/dashboard/employees": "employees",
    "/dashboard/attendance": "attendance",
    "/dashboard/leave": "leave",
    "/dashboard/holidays": "holidays",
    "/dashboard/salary": "salary",
    "/dashboard/company-accounts": "company_accounts",
    "/dashboard/payments": "payment_tracking",
    "/dashboard/lookups": "lookups",
  };
  const crmModuleForHref: Record<string, string> = {
    "/dashboard/crm": "crm_overview",
    "/dashboard/crm/companies": "crm_companies",
    "/dashboard/crm/custom-fields": "crm_custom_fields",
    "/dashboard/crm/leads": "crm_leads",
    "/dashboard/crm/experts": "crm_experts",
    "/dashboard/crm/orders": "crm_orders",
    "/dashboard/crm/contacts": "crm_contacts",
    "/dashboard/crm/segments": "crm_segments",
    "/dashboard/crm/webmail": "crm_webmail",
    "/dashboard/crm/templates": "crm_email_templates",
    "/dashboard/crm/campaigns": "crm_campaigns",
    "/dashboard/crm/automations": "crm_automations",
    "/dashboard/crm/analytics": "crm_analytics",
    "/dashboard/crm/settings": "crm_settings",
  };
  const employeeDefaultItems = [
    { label: "Dashboard", href: "/dashboard", icon: IconOverview },
    {
      label: "My attendance",
      href: "/dashboard/employee/attendance",
      icon: IconAttendance,
    },
    {
      label: "Notes & Reminders",
      href: "/dashboard/notes",
      icon: IconBell,
    },
    {
      label: "Internal Chat",
      href: "/dashboard/internal-chat",
      icon: IconBell,
    },
    {
      label: "My salary history",
      href: "/dashboard/employee/salary",
      icon: IconSalary,
    },
    {
      label: "Apply for leave",
      href: "/dashboard/employee/leave",
      icon: IconCalendar,
    },
    {
      label: "See holidays",
      href: "/dashboard/employee/holidays",
      icon: IconCalendar,
    },
    { label: "Settings", href: "/dashboard/settings", icon: IconSettings },
  ];
  const employeeGrantedItems = navItems.filter(
    (item) =>
      moduleForHref[item.href] &&
      grantedModules.includes(moduleForHref[item.href]),
  );
  const employeeCrmItems = crmNavItems.filter(
    (item) =>
      item.href !== "/dashboard/crm" &&
      crmModuleForHref[item.href] &&
      grantedModules.includes(crmModuleForHref[item.href]),
  );
  const firstCrmRoute = employeeCrmItems[0]?.href ?? "/dashboard/crm";
  const canAccessCrmWorkspace = grantedModules.some((module) =>
    module.startsWith("crm_"),
  );
  const isCrmWorkspace = pathname.startsWith("/dashboard/crm");
  const visibleNavItems =
    profile?.role === "superadmin" && isCrmWorkspace
      ? crmNavItems
      : profile?.role === "employee"
      ? isCrmWorkspace
        ? employeeCrmItems
        : [...employeeDefaultItems, ...employeeGrantedItems]
      : navItems;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <aside
        ref={sidebarRef}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[272px] flex-col border-r border-border bg-white transition-transform duration-300 ease-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <Link
            href="/dashboard"
            aria-label="Dashboard home"
            className="flex min-w-0 items-center gap-3"
            onClick={onClose}
          >
            <Image
              src="/logo.png"
              alt="Company logo"
              width={160}
              height={40}
              className="h-10 w-auto max-w-[168px] object-contain"
              priority
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary lg:hidden"
            aria-label="Close sidebar"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={sidebarScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5"
        >
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">
            {pathname.startsWith("/dashboard/crm")
              ? "Business CRM"
              : profile?.role === "employee"
              ? "Employee workspace"
              : "Admin workspace"}
          </p>
          {profile?.role === "superadmin" || (profile?.role === "employee" && canAccessCrmWorkspace) ? (
            <div ref={workspaceMenuRef} className="relative mb-5">
              <button type="button" onClick={() => setWorkspaceMenuOpen((open) => !open)} aria-expanded={workspaceMenuOpen} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2.5 text-left shadow-[0_6px_20px_rgba(28,20,18,0.05)] transition hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(28,20,18,0.09)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><IconBriefcase className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Workspace</span><span className="mt-0.5 block truncate text-sm font-bold text-foreground">{pathname.startsWith("/dashboard/crm") ? "Business CRM" : "Employee Management"}</span></span>
                <span className={cn("text-xs text-stone-400 transition-transform", workspaceMenuOpen && "rotate-180")}>⌄</span>
              </button>
              {workspaceMenuOpen ? <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-2xl border border-border bg-white p-2 shadow-[0_18px_45px_rgba(28,20,18,0.14)]"><Link href={pathname.startsWith("/dashboard/crm") ? "/dashboard" : firstCrmRoute} onClick={() => { setWorkspaceMenuOpen(false); onClose(); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition hover:bg-primary-soft hover:text-primary"><span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-100 text-stone-500"><IconBriefcase className="h-4 w-4" /></span><span>{pathname.startsWith("/dashboard/crm") ? "Employee Management" : "Business CRM"}</span></Link></div> : null}
            </div>
          ) : null}
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const active = item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href === "/dashboard/crm"
                  ? pathname === "/dashboard/crm"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200",
                    active
                      ? "bg-primary-soft text-primary shadow-[inset_0_0_0_1px_rgba(228,90,90,0.12)]"
                      : "text-stone-500 hover:bg-[#fbf6f5] hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl",
                      active
                        ? "bg-white text-primary shadow-sm"
                        : "bg-stone-50 text-stone-400",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate">{item.label}</span>
                    {item.href === "/dashboard/notes" && pendingNotes > 0 ? (
                      <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {pendingNotes > 99 ? "99+" : pendingNotes}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {profile?.full_name || user?.email || "Signed in"}
              </p>
              <p className="mt-0.5 text-xs capitalize text-muted">
                {profile?.role || "Account"}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="shrink-0 text-xs font-semibold text-muted hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
