"use client";

import clsx from "clsx";
import {
  BarChart3, Bot, Calculator, FileSearch, FileUp, LineChart, Menu, Sigma, Sparkles, Tag, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useHydrated, useStore } from "@/store/useStore";
import { useAiStatus } from "./useAi";

const NAV = [
  { section: "Analyze", items: [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/data", label: "Statements & Data", icon: FileUp },
    { href: "/forecast", label: "Forecast", icon: LineChart },
  ] },
  { section: "Decide", items: [
    { href: "/scenarios", label: "Sensitivity & Goal Seek", icon: Sigma },
    { href: "/optimize", label: "Optimizer", icon: Calculator },
    { href: "/pricing", label: "Pricing Lab", icon: Tag },
  ] },
  { section: "Advise", items: [
    { href: "/documents", label: "Document Advisor", icon: FileSearch },
    { href: "/workflow", label: "AI Workflow Analyzer", icon: Bot },
  ] },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-lg shadow-indigo-900/30">
        <Zap className="h-5 w-5 text-amber-300" fill="currentColor" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">Fin-Zeus <span className="text-amber-300">2.0</span></div>
        <div className="text-[11px] text-indigo-200/70">Financial Intelligence Hub</div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const ai = useAiStatus();
  return (
    <div className="flex h-full flex-col bg-[#0f1330] text-slate-300">
      <div className="px-5 pb-6 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        {NAV.map((g) => (
          <div key={g.section}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.section}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={onNavigate}
                    className={clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                      active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className={clsx("h-4 w-4", active ? "text-amber-300" : "text-slate-500 group-hover:text-slate-300")} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-3 text-[12px]">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> AI engine
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-slate-400">
          <span className={clsx("h-2 w-2 rounded-full", ai === null ? "bg-slate-500" : ai.configured ? "bg-emerald-400" : "bg-amber-400")} />
          {ai === null ? "Checking…" : ai.configured ? "Claude connected" : "Built-in rules (no API key)"}
        </div>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const ds = useStore((s) => s.dataset);
  const hydrated = useHydrated();
  const range = ds.periods.length ? `${ds.periods[0]} → ${ds.periods[ds.periods.length - 1]}` : "No data";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
      <button className="rounded-lg p-1.5 text-muted hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        {hydrated && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{ds.company}</span>
            {ds.isSample && <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline">Demo data</span>}
            <span className="hidden truncate text-[12px] text-muted md:inline">· {ds.lines.length} line items · {range} · {ds.granularity}ly</span>
          </div>
        )}
      </div>
      <Link href="/data" className="hidden h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white shadow-sm hover:bg-indigo-700 sm:inline-flex">
        <FileUp className="h-4 w-4" /> Upload statements
      </Link>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const hydrated = useHydrated();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button className="absolute right-3 top-4 z-10 rounded-lg p-1 text-slate-400 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {hydrated ? <div className="fade-up">{children}</div> : <LoadingSkeleton />}
        </main>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-64 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="skeleton h-80 rounded-2xl" />
    </div>
  );
}
