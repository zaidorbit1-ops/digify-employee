"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IconMenu } from "@/components/icons";
import { AttendanceNotifier } from "@/components/attendance/attendance-notifier";
import { useAuth } from "@/components/auth/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalLoader } from "@/components/ui/global-loader";

const titles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/devices": "Devices",
  "/dashboard/employees": "Employees",
  "/dashboard/attendance": "Attendance",
  "/dashboard/lookups": "Lookup lists",
  "/dashboard/employee": "Employee portal",
  "/dashboard/settings": "Settings",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const title = titles[pathname] ?? "Dashboard";
  const { profile, user, loading, profileError, signOut } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted">Loading your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalLoader />
      <AttendanceNotifier />
      <div className="flex min-h-screen">
        <Sidebar open={open} onClose={() => setOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border text-foreground"
              aria-label="Open sidebar"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <Image
              src="/logo.png"
              alt="Company logo"
              width={120}
              height={32}
              className="h-8 w-auto object-contain"
            />
            <span className="ml-auto text-sm font-semibold">{title}</span>
          </header>

          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {profileError ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{profileError} Ask your administrator to link your account in the profiles table.</div> : null}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
