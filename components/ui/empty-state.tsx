import Link from "next/link";
import { IconArrowRight } from "@/components/icons";

export function EmptyState({
  text,
  href,
  label,
}: {
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-[#fcfaf9] px-6 py-8 text-center">
      <p className="text-sm text-muted">{text}</p>
      {href && label ? (
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {label}
          <IconArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function Alert({
  children,
  tone = "info",
}: {
  children: string;
  tone?: "info" | "success" | "danger";
}) {
  const styles = {
    info: "border-primary/20 bg-primary-soft text-primary",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
  } as const;

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}
