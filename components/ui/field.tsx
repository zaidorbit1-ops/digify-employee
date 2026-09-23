import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { IconArrowRight } from "@/components/icons";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/cn";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-600">{label}</span>
      {children}
    </div>
  );
}

const controlClass =
  "w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition duration-200 placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/12";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === "month") {
    return <MonthPicker className={className} value={String(props.value ?? "")} onChange={(value) => props.onChange?.({ target: { value } } as React.ChangeEvent<HTMLInputElement>)} />;
  }
  return <input className={cn(controlClass, className)} {...props} />;
}

export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={cn(
          controlClass,
          "cursor-pointer appearance-none pr-10",
          "disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400",
          className,
        )}
      >
        {children}
      </select>
      <IconArrowRight
        className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-stone-400"
      />
    </div>
  );
}
