"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconSearch } from "@/components/icons";
import { cn } from "@/lib/cn";

type FilterOption = { value: string; label: string };

export function FilterPicker({ options, value, onChange, placeholder, className }: { options: FilterOption[]; value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));

  function togglePicker() {
    if (!open && pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.right - 280, window.innerWidth - 296)) });
    }
    setOpen(!open);
  }

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

  return <div ref={pickerRef} className={cn("relative inline-block", className)}>
    <button type="button" onClick={(event) => { event.stopPropagation(); togglePicker(); }} className="flex h-9 w-full min-w-[150px] items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 text-left text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/12"><span className="truncate">{selected?.label ?? placeholder}</span><IconArrowRight className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition ${open ? "rotate-[270deg]" : "rotate-90"}`} /></button>
    {open ? <div style={{ top: menuPosition.top, left: menuPosition.left }} className="fixed z-50 w-[min(280px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_50px_rgba(51,32,28,0.16)]"><div className="border-b border-border bg-[#fffaf9] p-3"><div className="relative"><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${placeholder.toLowerCase()}`} className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></div></div><div className="max-h-64 overflow-y-auto p-2">{filteredOptions.map((option) => <button type="button" key={option.value} onClick={() => { onChange(option.value); setSearch(""); setOpen(false); }} className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition first:mt-0 ${value === option.value ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft/60"}`}><span>{option.label}</span>{value === option.value ? <span className="text-[10px] font-bold uppercase tracking-wider">Selected</span> : null}</button>)}{!filteredOptions.length ? <p className="px-3 py-6 text-center text-xs text-muted">No options found.</p> : null}</div></div> : null}
  </div>;
}
