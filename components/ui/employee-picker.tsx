"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconEmployees, IconSearch } from "@/components/icons";
import { cn } from "@/lib/cn";

type EmployeeOption = { id: number; name: string; employee_id?: string | null };

export function EmployeePicker({ employees, value, onChange, className }: { employees: EmployeeOption[]; value: string; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = employees.find((employee) => String(employee.id) === value);
  const filteredEmployees = employees.filter((employee) => `${employee.name} ${employee.employee_id ?? ""}`.toLowerCase().includes(search.toLowerCase()));

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

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!pickerRef.current) return;
      const rect = pickerRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.right - 300, window.innerWidth - 316)) });
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  function choose(employeeId: string) {
    onChange(employeeId);
    setSearch("");
    setOpen(false);
  }

  function togglePicker() {
    if (!open && pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.right - 300, window.innerWidth - 316)) });
    }
    setOpen(!open);
  }

  return <div ref={pickerRef} className={cn("relative inline-block", className)}>
    <button type="button" onClick={(event) => { event.stopPropagation(); togglePicker(); }} className="flex h-9 w-full min-w-[190px] items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 text-left text-xs text-foreground outline-none transition hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/12">
      <span className="flex min-w-0 items-center gap-2"><IconEmployees className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{selected?.name ?? "All employees"}</span></span><IconArrowRight className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition ${open ? "rotate-[270deg]" : "rotate-90"}`} />
    </button>
    {open ? <div style={{ top: menuPosition.top, left: menuPosition.left }} className="fixed z-50 w-[min(300px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_50px_rgba(51,32,28,0.16)]">
      <div className="border-b border-border bg-[#fffaf9] p-3"><div className="relative"><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" /></div></div>
      <div className="max-h-64 overflow-y-auto p-2"><button type="button" onClick={() => choose("all")} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${value === "all" ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft/60"}`}><span>All employees</span>{value === "all" ? <span className="text-[10px] font-bold uppercase tracking-wider">Selected</span> : null}</button>{filteredEmployees.map((employee) => <button type="button" key={employee.id} onClick={() => choose(String(employee.id))} className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${value === String(employee.id) ? "bg-primary-soft text-primary" : "text-foreground hover:bg-primary-soft/60"}`}><span className="min-w-0"><span className="block truncate font-semibold">{employee.name}</span>{employee.employee_id ? <span className="mt-0.5 block text-[10px] text-muted">ID · {employee.employee_id}</span> : null}</span>{value === String(employee.id) ? <span className="text-[10px] font-bold uppercase tracking-wider">Selected</span> : null}</button>)}{!filteredEmployees.length ? <p className="px-3 py-6 text-center text-xs text-muted">No employees found.</p> : null}</div>
    </div> : null}
  </div>;
}
