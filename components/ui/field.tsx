import { Children, isValidElement, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { IconArrowRight, IconSearch } from "@/components/icons";
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
  value,
  onChange,
  disabled,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = [] as { value: string; label: string }[];
  Children.toArray(children).forEach((child) => {
    if (isValidElement<{ value?: string; children?: ReactNode }>(child)) {
      options.push({ value: String(child.props.value ?? ""), label: String(child.props.children ?? "") });
    }
  });
  const selectedValue = String(value ?? "");
  const selected = options.find((option) => option.value === selectedValue);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function choose(nextValue: string) {
    onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
    setSearch("");
    setOpen(false);
  }

  function togglePicker() {
    if (!open && pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.right - 280, window.innerWidth - 296)) });
    }
    setOpen(!open);
  }

  return <div ref={pickerRef} className="relative w-full">
    <button type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); togglePicker(); }} className={cn(controlClass, "flex items-center justify-between gap-3 text-left", disabled && "cursor-not-allowed opacity-60", className)} {...props as React.ButtonHTMLAttributes<HTMLButtonElement>}><span className="truncate">{selected?.label ?? "Select an option"}</span><IconArrowRight className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition ${open ? "rotate-[270deg]" : "rotate-90"}`} /></button>
    {open ? <div style={{ top: menuPosition.top, left: menuPosition.left }} className="fixed z-50 w-[min(280px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_50px_rgba(51,32,28,0.16)]"><div className="border-b border-border bg-[#fffaf9] p-3"><div className="relative"><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search options" className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></div></div><div className="max-h-64 overflow-y-auto p-2">{filteredOptions.map((option) => <button type="button" key={option.value} onClick={() => choose(option.value)} className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition first:mt-0 ${selectedValue === option.value ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft/60"}`}><span>{option.label}</span>{selectedValue === option.value ? <span className="text-[10px] font-bold uppercase tracking-wider">Selected</span> : null}</button>)}{!filteredOptions.length ? <p className="px-3 py-6 text-center text-xs text-muted">No options found.</p> : null}</div></div> : null}
  </div>;
}
