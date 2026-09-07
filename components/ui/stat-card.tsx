import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  tone?: "primary" | "emerald" | "amber" | "sky";
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_10px_30px_rgba(28,20,18,0.035)]">
      <div
        className={cn(
          "mb-5 grid h-11 w-11 place-items-center rounded-2xl",
          tone === "primary" && "bg-primary-soft text-primary",
          tone === "emerald" && "bg-emerald-50 text-emerald-600",
          tone === "amber" && "bg-amber-50 text-amber-600",
          tone === "sky" && "bg-sky-50 text-sky-600",
        )}
      >
        <span className="h-5 w-5">{icon}</span>
      </div>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-stone-400">{detail}</p>
    </div>
  );
}
