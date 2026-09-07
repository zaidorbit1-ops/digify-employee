import { cn } from "@/lib/cn";

type BadgeProps = {
  children: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
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
      )}
    >
      {children}
    </span>
  );
}
