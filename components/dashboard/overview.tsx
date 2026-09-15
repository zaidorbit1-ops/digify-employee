"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconArrowRight,
  IconAttendance,
  IconBriefcase,
  IconCheck,
  IconDevices,
  IconEmployees,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconWallet,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Device = { id: number; name: string; device_ip: string; port: number; status: string };
type Employee = { id: number; name: string; employee_id?: string; zk_device_uid?: number | null };
type AttendanceRow = { id: number; zk_user_id: number; check_in: string; employee?: Employee | null };
type Weather = { temperature: number; feelsLike: number; windSpeed: number; label: string };

const quickLinks = [
  { label: "Add employee", detail: "Create a team profile", href: "/dashboard/employees", icon: IconEmployees, tone: "bg-rose-50 text-rose-600" },
  { label: "Review attendance", detail: "Check today's sessions", href: "/dashboard/attendance", icon: IconAttendance, tone: "bg-sky-50 text-sky-600" },
  { label: "Run payroll", detail: "Prepare monthly salaries", href: "/dashboard/salary", icon: IconWallet, tone: "bg-amber-50 text-amber-600" },
  { label: "Manage accounts", detail: "Open company credentials", href: "/dashboard/company-accounts", icon: IconBriefcase, tone: "bg-orange-50 text-orange-600" },
];

const businessQuotes = [
  "Build systems that make great work repeatable.",
  "A clear strategy turns busy work into business progress.",
  "Strong businesses are built by solving real customer problems.",
  "Consistency is the quiet advantage behind every lasting company.",
  "Great teams turn shared purpose into measurable results.",
  "Profit follows value when value is delivered with discipline.",
  "The best leaders create clarity, trust, and room to grow.",
  "Every customer conversation is a chance to improve the business.",
  "Execution is where a good idea earns its place in the market.",
  "Small operational improvements become powerful competitive advantages.",
  "Protect your reputation by making promises you can keep.",
  "A focused team can outperform a larger team without direction.",
  "Measure what matters, then improve what you measure.",
  "Your process should make the right action the easy action.",
  "Business growth begins with a problem worth solving well.",
  "Good decisions compound when they are made with clear principles.",
  "The strongest brands are remembered for how they make people feel.",
  "Innovation is useful when it creates a better outcome for someone.",
  "A healthy culture is a business advantage you can feel in the numbers.",
  "Lead with questions, decide with evidence, and act with courage.",
  "The next level of growth usually requires a better system, not more noise.",
  "Reliable service is one of the most valuable forms of marketing.",
  "Cash flow rewards businesses that respect timing and discipline.",
  "Hire for character, develop for capability, and trust people with ownership.",
  "A business becomes stronger every time it learns from a customer.",
  "Clarity in priorities gives talent a direction to run toward.",
  "The goal is not to look busy; the goal is to create value.",
  "Sustainable success is built one well-served customer at a time.",
  "Great work is easier when the team knows why it matters.",
  "A decision delayed too long can cost more than a decision improved later.",
  "Make the customer outcome the centre of every important decision.",
  "Every strong quarter starts with ordinary work done exceptionally well.",
  "Your competitive edge is often hidden inside your daily habits.",
  "The best business plan is supported by consistent execution.",
  "Trust grows when your actions match your standards.",
  "Scale the process before you scale the pressure.",
  "A thoughtful follow-up can turn interest into a lasting relationship.",
  "Leadership is turning uncertainty into a direction people can act on.",
  "Do not chase every opportunity; choose the ones that fit your mission.",
  "The companies that keep learning are the companies that keep earning relevance.",
];
const companyStories = [
  "Amazon started with books, survived years of doubt, and aimed to make everything easy to discover.",
  "Apple began with limited resources and a bold aim: make technology useful, beautiful, and human.",
  "Airbnb started with an air mattress and the struggle to pay rent, then aimed to make belonging possible anywhere.",
  "Microsoft began with a small software opportunity and aimed to put a computer on every desk.",
  "Nike began by solving runners' practical problems and kept pushing toward better performance for every athlete.",
  "Netflix faced an inconvenient rental model and aimed to give people simpler access to entertainment.",
  "Google started with a messy information problem and aimed to make the world's knowledge easier to find.",
  "Samsung grew through reinvention and persistence, aiming to make useful technology available to more people.",
  "Toyota answered pressure with continuous improvement and aimed to make quality part of every process.",
  "WhatsApp began with a simple communication need and aimed to connect people without friction.",
  "Instagram started with a crowded product idea, found its focus, and aimed to make sharing feel effortless.",
  "LinkedIn began with a small professional network and aimed to turn trusted connections into opportunity.",
  "The biggest companies often begin with one painful problem and the courage to solve it patiently.",
  "A small first version can become a powerful company when the team keeps listening through every struggle.",
  "Start with the customer problem, survive the imperfect beginning, and improve the answer every day.",
];

const nightQuotes = [
  "Small steps still move you forward.",
  "Your consistency is becoming your strength.",
  "Progress grows quietly before it becomes visible.",
  "One focused hour can change the shape of tomorrow.",
  "Keep going; your future self is taking notes.",
  "You are closer than yesterday.",
  "A clear mind creates clear momentum.",
  "The work you repeat becomes the life you build.",
  "Make today count, even in a small way.",
  "Your effort is never wasted when it teaches you.",
  "Discipline carries you when motivation gets quiet.",
  "Start where you are and improve one thing.",
  "You do not need perfect conditions to make progress.",
  "Every finished task is proof that you can do hard things.",
  "Focus on the next useful step.",
  "A better routine begins with one better choice.",
  "Your pace is valid when you keep moving.",
  "Clarity comes after you begin.",
  "The version of you ahead is built by what you do now.",
  "Turn pressure into a plan.",
  "Do less, better, and with intention.",
  "Your attention is one of your greatest assets.",
  "Keep promises to yourself small enough to keep.",
  "Momentum is made from ordinary actions.",
  "You can reset without starting over.",
  "Good work compounds when you give it time.",
  "Choose progress over performance.",
  "A calm start can create a powerful finish.",
  "Let action answer the doubt.",
  "You are allowed to grow at your own speed.",
  "One brave decision can open a new direction.",
  "Keep your standards high and your next step simple.",
  "Rest is part of the process, not a detour.",
  "The hard days are still part of the story.",
  "Build something your tomorrow will thank you for.",
  "Your best work starts with showing up.",
  "A little progress is still a win.",
  "You have handled difficult days before.",
  "Let patience work with your ambition.",
  "The goal gets easier when the habit gets stronger.",
  "Make room for better possibilities.",
  "You do not need permission to begin again.",
  "Confidence is built through kept commitments.",
  "Your quiet effort is building loud results.",
  "Simplify the task, then take it on.",
  "The next chapter starts with the next choice.",
  "You can be both a work in progress and proud.",
  "Keep learning; it keeps every door open.",
  "The direction matters more than the speed.",
  "Make your energy serve what matters most.",
  "A strong finish can begin right now.",
  "You are capable of more thoughtful progress.",
  "Do not confuse a slow season with a stopped journey.",
  "Your future is shaped by repeated present choices.",
  "Take the lesson, leave the weight.",
  "Good things grow from consistent care.",
  "You can make the next attempt wiser.",
  "Protect your focus like it matters, because it does.",
  "Every day offers a clean place to continue.",
  "Your work has value before anyone applauds it.",
  "Choose the habit that makes tomorrow lighter.",
  "You are not behind; you are becoming.",
  "One clear priority can change the whole day.",
  "Keep your eyes on the work, not the noise.",
  "You can turn uncertainty into curiosity.",
  "A finished beginning is better than a perfect plan.",
  "Let your actions be bigger than your excuses.",
  "You have more room to grow than you think.",
  "The right next step is enough for now.",
  "Progress is often quieter than expectation.",
  "Your effort becomes easier to trust when it is repeated.",
  "Make your standards a guide, not a weapon.",
  "You are building trust with yourself every day.",
  "Difficult does not mean impossible.",
  "Stay curious about what you can become.",
  "The work gets lighter when the purpose gets clearer.",
  "You can create order one decision at a time.",
  "A thoughtful pace still reaches meaningful places.",
  "Your next win may be smaller than expected and just as important.",
  "Keep the promise, even if you change the plan.",
  "A fresh perspective can unlock an old problem.",
  "You are stronger every time you return to the work.",
  "Let consistency introduce you to your potential.",
  "Do what matters before what merely makes noise.",
  "Your goals deserve practical steps.",
  "You can end the day proud of one honest effort.",
  "Use today as evidence that you can continue.",
  "Small improvements create remarkable distance.",
  "Keep your progress visible to yourself.",
  "The answer often appears after the first attempt.",
  "You can make room for ambition and peace.",
  "Trust the process you are willing to practice.",
  "Your attention today is an investment in tomorrow.",
  "There is strength in starting simply.",
  "You are allowed to make meaningful progress imperfectly.",
  "A better outcome begins with a better question.",
  "Keep building; the foundation matters.",
  "Your patience is part of your power.",
  "The next version begins with this version trying.",
  "Every useful choice adds to your momentum.",
  "You can finish the day by choosing hope and action.",
  "Keep moving toward what makes the work worthwhile.",
  "Tomorrow gets better when today gets intentional.",
];

const allQuotes = interleaveQuotes([...businessQuotes, ...nightQuotes], companyStories);

function interleaveQuotes(primary: string[], secondary: string[]) {
  const result: string[] = [];
  primary.forEach((quote, index) => {
    result.push(quote);
    if (secondary[index]) result.push(secondary[index]);
  });
  return result;
}

export function OverviewView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceChecks, setDeviceChecks] = useState<Record<number, boolean | null>>({});
  const [weather, setWeather] = useState<Weather | null>(null);
  const [karachiNow, setKarachiNow] = useState(() => new Date());
  const [quoteIndex, setQuoteIndex] = useState(0);

  async function checkDeviceConnections(currentDevices: Device[]) {
    const checks = await Promise.all(
      currentDevices.map(async (device) => {
        try {
          const response = await fetch("/api/devices/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_ip: device.device_ip, port: device.port }),
          });
          const result = await response.json();
          return [device.id, Boolean(response.ok && result.ok)] as const;
        } catch {
          return [device.id, false] as const;
        }
      }),
    );
    setDeviceChecks(Object.fromEntries(checks));
  }

  async function loadDashboard() {
    setError(null);
    const month = new Date().toISOString().slice(0, 7);
    const responses = await Promise.all([
      fetch("/api/devices", { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
      fetch(`/api/attendance?view=history&month=${month}`, { cache: "no-store" }),
    ]);
    const results = await Promise.all(responses.map((response) => response.json()));
    const failed = responses.findIndex((response) => !response.ok);
    if (failed >= 0) throw new Error(results[failed].error ?? "Could not load dashboard data.");
    setDevices(results[0].devices ?? []);
    setEmployees(results[1].employees ?? []);
    setAttendance(results[2].attendance ?? []);
    await checkDeviceConnections(results[0].devices ?? []);
  }

  useEffect(() => {
    loadDashboard()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load dashboard data."))
      .finally(() => setLoading(false));
    const timer = window.setInterval(() => loadDashboard().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * allQuotes.length));
    const timer = window.setInterval(() => setKarachiNow(new Date()), 60000);
    fetch("https://api.open-meteo.com/v1/forecast?latitude=24.8607&longitude=67.0011&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=Asia%2FKarachi")
      .then((response) => response.json())
      .then((result) => {
        const current = result.current;
        if (!current) return;
        setWeather({
          temperature: Math.round(current.temperature_2m),
          feelsLike: Math.round(current.apparent_temperature),
          windSpeed: Math.round(current.wind_speed_10m),
          label: weatherLabel(Number(current.weather_code)),
        });
      })
      .catch(() => setWeather(null));
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % allQuotes.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    setRefreshing(true);
    setQuoteIndex(Math.floor(Math.random() * allQuotes.length));
    try {
      await loadDashboard();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh dashboard.");
    } finally {
      setRefreshing(false);
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendance.filter((row) => row.check_in.slice(0, 10) === todayKey);
  const uniqueToday = new Set(todayAttendance.map((row) => row.employee?.id ?? `device-${row.zk_user_id}`)).size;
  const mappedEmployees = employees.filter((employee) => employee.zk_device_uid != null).length;
  const reachableDevices = devices.filter((device) => deviceChecks[device.id] === true).length;
  const latestAttendance = attendance[0]?.check_in ? new Date(attendance[0].check_in) : null;
  const dataFeedIsRecent = latestAttendance ? Date.now() - latestAttendance.getTime() < 24 * 60 * 60 * 1000 : false;
  const attendanceRate = employees.length ? Math.min(100, Math.round((uniqueToday / employees.length) * 100)) : 0;
  const karachiTime = karachiNow.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true });
  const karachiHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false }).format(karachiNow));
  const isNight = karachiHour < 5 || karachiHour >= 21;
  const nightQuote = allQuotes[quoteIndex];
  const greeting = karachiHour >= 5 && karachiHour < 12 ? "Good morning" : karachiHour < 17 ? "Good afternoon" : karachiHour < 21 ? "Good evening" : "Hello Night Owl";
  const pageTitle = isNight ? greeting : `${greeting}, here's the pulse.`;
  const pageDescription = isNight
    ? `Karachi ${karachiTime} · ${weather ? `${weather.temperature}°C, ${weather.label}` : "Weather unavailable"} · Live local time and weather`
    : `Karachi ${karachiTime} · A focused view of your people, attendance and connected operations.`;

  const chart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        count: new Set(attendance.filter((row) => row.check_in.slice(0, 10) === key).map((row) => row.employee?.id ?? row.zk_user_id)).size,
      };
    });
    const peak = Math.max(...days.map((day) => day.count), 1);
    return days.map((day) => ({ ...day, height: Math.max(8, Math.round((day.count / peak) * 100)) }));
  }, [attendance]);

  return (
    <>
      <PageHeader
        eyebrow="Admin workspace"
        title={pageTitle}
        description={pageDescription}
        actions={<div className="flex items-center gap-2"><WeatherSummary weather={weather} /><Button variant="secondary" onClick={refresh} disabled={refreshing}><IconRefresh className="h-4 w-4" />{refreshing ? "Refreshing" : "Refresh"}</Button></div>}
      />

      <div className="daily-quote-banner -mt-3 mb-6 flex max-w-3xl items-center gap-4 overflow-hidden rounded-2xl border border-primary/20 px-4 py-3.5 shadow-[0_12px_36px_rgba(228,90,90,0.12)] sm:px-5"><span className="daily-quote-orb" aria-hidden="true" /><span className="daily-quote-mark grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl text-white">✦</span><p key={quoteIndex} className="daily-quote-text text-sm font-semibold leading-6 text-[#5e433f] sm:text-[15px]">{nightQuote}</p><span className="ml-auto hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-primary sm:block">Daily note</span></div>

      {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}

      {loading ? (
        <Card className="p-8 text-sm text-muted">Loading dashboard data...</Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Total employees" value={employees.length} note={`${mappedEmployees} linked to devices`} icon={<IconEmployees className="h-5 w-5" />} tone="rose" />
            <Metric label="Present today" value={uniqueToday} note={`${attendanceRate}% team coverage`} icon={<IconCheck className="h-5 w-5" />} tone="emerald" />
            <Metric label="Attendance logs" value={todayAttendance.length} note="Captured today" icon={<IconAttendance className="h-5 w-5" />} tone="sky" />
            <Metric label="Reachable devices" value={reachableDevices} note={`${devices.length} configured · live test`} icon={<IconDevices className="h-5 w-5" />} tone="amber" />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Attendance analytics</p><h2 className="mt-1 text-lg font-bold">Unique attendance, last 7 days</h2></div>
                <Badge tone="success">Live data</Badge>
              </div>
              <div className="mt-7 flex h-52 items-end gap-2 sm:gap-4">
                {chart.map((day) => <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-semibold text-foreground">{day.count || ""}</span><div className="w-full max-w-10 rounded-t-lg bg-primary transition-all duration-500" style={{ height: `${day.height}%` }} /><span className="text-[11px] font-medium text-muted">{day.label}</span></div>)}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted"><span>Based on mapped employee punches</span><Link href="/dashboard/attendance" className="inline-flex items-center gap-1 font-semibold text-primary">Open attendance <IconArrowRight className="h-3.5 w-3.5" /></Link></div>
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Workforce status</p><h2 className="mt-1 text-lg font-bold">Today at a glance</h2></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><IconCheck className="h-5 w-5" /></span></div>
              <div className="mt-6 flex items-center gap-5"><div className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#10b981 ${attendanceRate}%, #f1ecea 0)` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white"><strong className="text-2xl">{attendanceRate}%</strong></div></div><div><p className="text-2xl font-bold">{uniqueToday} <span className="text-sm font-medium text-muted">of {employees.length}</span></p><p className="mt-1 text-sm text-muted">employees have a punch today</p></div></div>
              <div className="mt-6 space-y-3 text-sm"><StatusLine label="Device network" value={devices.length ? `${reachableDevices}/${devices.length} reachable` : "No devices"} good={devices.length > 0 && reachableDevices === devices.length} /><StatusLine label="Attendance data feed" value={dataFeedIsRecent ? "Recent data received" : "No recent record"} good={dataFeedIsRecent} /><StatusLine label="Employee mapping" value={`${mappedEmployees}/${employees.length || 0} linked`} good={mappedEmployees === employees.length && employees.length > 0} /></div>
            </Card>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Shortcuts</p><h2 className="mt-1 text-lg font-bold">Move work forward</h2></div><IconPlus className="h-5 w-5 text-muted" /></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{quickLinks.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/30 hover:bg-primary-soft/40"><span className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.label}</strong><span className="mt-0.5 block truncate text-xs text-muted">{item.detail}</span></span><IconArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" /></Link>; })}</div></Card>
            <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Recent activity</p><h2 className="mt-1 text-lg font-bold">Latest punches</h2></div><Link href="/dashboard/attendance" aria-label="View attendance" className="text-primary"><IconArrowRight className="h-5 w-5" /></Link></div><div className="mt-4 divide-y divide-border">{attendance.length ? attendance.slice(0, 4).map((row) => <div key={row.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{(row.employee?.name ?? "U").charAt(0)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.employee?.name ?? `K60 User #${row.zk_user_id}`}</p><p className="text-xs text-muted">{new Date(row.check_in).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></div><Badge tone="success">Recorded</Badge></div>) : <p className="py-6 text-sm text-muted">No attendance activity yet.</p>}</div></Card>
          </section>

          <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-white p-4 shadow-[0_8px_24px_rgba(36,27,25,0.04)]"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-stone-600"><IconSettings className="h-5 w-5" /></span><div><p className="text-sm font-bold">Keep your workspace healthy</p><p className="text-xs text-muted">Review devices and unmapped employees before payroll.</p></div></div><div className="flex gap-2"><Link href="/dashboard/devices" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-stone-50">Manage devices</Link><Link href="/dashboard/settings" className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-white hover:opacity-90">Open settings</Link></div></section>
        </>
      )}
    </>
  );
}

function Metric({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: ReactNode; tone: "rose" | "emerald" | "sky" | "amber" }) {
  const tones = { rose: "bg-rose-50 text-rose-600", emerald: "bg-emerald-50 text-emerald-600", sky: "bg-sky-50 text-sky-600", amber: "bg-amber-50 text-amber-600" };
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span><span className="text-xs font-medium text-emerald-600">+ live</span></div><p className="mt-5 text-sm font-medium text-muted">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></Card>;
}

function StatusLine({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"><span className="text-muted">{label}</span><span className={`flex items-center gap-2 text-xs font-bold ${good ? "text-emerald-600" : "text-amber-600"}`}><span className={`h-2 w-2 rounded-full ${good ? "bg-emerald-500" : "bg-amber-500"}`} />{value}</span></div>;
}

function WeatherSummary({ weather }: { weather: Weather | null }) {
  return <div className="hidden items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left sm:flex"><span className="text-lg">{weather ? "☀" : "·"}</span><span><strong className="block text-xs">{weather ? `${weather.temperature}°C · ${weather.label}` : "Weather unavailable"}</strong><span className="block text-[10px] text-muted">Karachi · feels {weather ? `${weather.feelsLike}°C` : "-"}</span></span></div>;
}

function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Showers";
  return "Stormy";
}
