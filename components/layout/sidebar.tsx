"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconAttendance,
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
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: IconOverview },
  { label: "Devices", href: "/dashboard/devices", icon: IconDevices },
  { label: "Employees", href: "/dashboard/employees", icon: IconEmployees },
  { label: "Attendance", href: "/dashboard/attendance", icon: IconAttendance },
  { label: "Leave", href: "/dashboard/leave", icon: IconCalendar },
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

  const moduleForHref: Record<string, string> = {
    "/dashboard/devices": "devices",
    "/dashboard/employees": "employees",
    "/dashboard/attendance": "attendance",
    "/dashboard/leave": "leave",
    "/dashboard/salary": "salary",
    "/dashboard/company-accounts": "company_accounts",
    "/dashboard/payments": "payment_tracking",
    "/dashboard/lookups": "lookups",
  };
  const employeeDefaultItems = [
    { label: "Dashboard", href: "/dashboard", icon: IconOverview },
    {
      label: "My attendance",
      href: "/dashboard/employee/attendance",
      icon: IconAttendance,
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
    { label: "Settings", href: "/dashboard/settings", icon: IconSettings },
  ];
  const employeeGrantedItems = navItems.filter(
    (item) =>
      moduleForHref[item.href] &&
      grantedModules.includes(moduleForHref[item.href]),
  );
  const visibleNavItems =
    profile?.role === "employee"
      ? [...employeeDefaultItems, ...employeeGrantedItems]
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
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-border bg-white transition-transform duration-300 ease-out lg:static lg:translate-x-0",
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

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">
            {profile?.role === "employee"
              ? "Employee workspace"
              : "Admin workspace"}
          </p>
          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
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
                  {item.label}
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
