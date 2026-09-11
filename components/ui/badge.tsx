import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary" | "holiday";
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        tone === "neutral" && "bg-stone-100 text-stone-600",
        tone === "success" && "bg-emerald-50 text-emerald-700",
        tone === "warning" && "bg-amber-50 text-amber-700",
        tone === "danger" && "bg-rose-50 text-rose-700",
        tone === "primary" && "bg-primary-soft text-primary",
        tone === "holiday" && "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
      )}
    >
      {children}
    </span>
  );
}
