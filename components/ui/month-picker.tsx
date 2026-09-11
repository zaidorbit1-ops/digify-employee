"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconCalendar } from "@/components/icons";
import { cn } from "@/lib/cn";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function MonthPicker({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7)) - 1;
  const label = value ? new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Select month";

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

  function selectMonth(month: number) {
    onChange(`${year}-${String(month + 1).padStart(2, "0")}`);
    setOpen(false);
  }

  function togglePicker() {
    if (!open && pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.right - 330, window.innerWidth - 346)) });
    }
    setOpen(!open);
  }

  return <div ref={pickerRef} className={cn("relative inline-block", className)}>
    <button type="button" onClick={(event) => { event.stopPropagation(); setYear(selectedYear || new Date().getFullYear()); togglePicker(); }} className="flex h-10 w-[220px] max-w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 text-left text-sm text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/12">
      <span className="flex min-w-0 items-center gap-2"><IconCalendar className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{label}</span></span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Change</span>
    </button>
    {open ? <div style={{ top: menuPosition.top, left: menuPosition.left }} className="fixed z-50 w-[min(330px,calc(100vw-48px))] rounded-2xl border border-border bg-white p-4 shadow-[0_18px_50px_rgba(51,32,28,0.16)]">
      <div className="mb-4 flex items-center justify-between"><button type="button" aria-label="Previous year" onClick={() => setYear((current) => current - 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary"><IconArrowRight className="h-4 w-4 rotate-180" /></button><div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Select period</p><p className="mt-0.5 text-lg font-bold tracking-tight">{year}</p></div><button type="button" aria-label="Next year" onClick={() => setYear((current) => current + 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary"><IconArrowRight className="h-4 w-4" /></button></div>
      <div className="grid grid-cols-3 gap-2">{monthNames.map((monthName, index) => { const selected = selectedYear === year && selectedMonth === index; return <button type="button" key={monthName} onClick={() => selectMonth(index)} className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${selected ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary-soft hover:text-primary"}`}>{monthName.slice(0, 3)}</button>; })}</div>
    </div> : null}
  </div>;
}
