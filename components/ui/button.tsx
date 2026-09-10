import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const showSpinner = loading || Boolean(props.disabled);

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-primary text-white shadow-[0_8px_20px_rgba(228,90,90,0.22)] hover:bg-primary-hover",
        variant === "secondary" &&
          "border border-border bg-white text-foreground hover:border-primary/30 hover:bg-primary-soft",
        variant === "ghost" && "text-muted hover:bg-primary-soft hover:text-primary",
        className,
      )}
      aria-busy={showSpinner || undefined}
      {...props}
    >
      {showSpinner ? <span className="button-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
