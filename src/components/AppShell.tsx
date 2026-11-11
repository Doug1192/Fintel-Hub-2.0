"use client";

import clsx from "clsx";
import {
  Archive, BarChart3, Bot, Calculator, ChevronDown, FileSearch, FileUp, LineChart, Lock, Menu, Plus, Settings2, Sigma, Sparkles, Tag, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useActiveAlias, useDataset, useHydrated, useStore } from "@/store/useStore";
import type { ModuleKey } from "@/lib/types";
import { useAiStatus } from "./useAi";
import { ModuleGate } from "./ModuleGate";

type NavItem = { href: string; label: string; icon: typeof BarChart3; module?: ModuleKey };

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Workspace", items: [
    { href: "/vault", label: "Aliases & Vault", icon: Archive },
    { href: "/data", label: "Statements & Data", icon: FileUp },
  ] },
  { section: "Analyze", items: [
    { href: "/", label: "Dashboard", icon: BarChart3, module: "dashboard" },
    { href: "/forecast", label: "Forecast", icon: LineChart, module: "forecast" },
  ] },
  { section: "Decide", items: [
    { href: "/scenarios", label: "Sensitivity & Goal Seek", icon: Sigma, module: "scenarios" },
    { href: "/optimize", label: "Optimizer", icon: Calculator, module: "optimize" },
    { href: "/pricing", label: "Pricing Lab", icon: Tag, module: "pricing" },
  ] },
  { section: "Advise", items: [
    { href: "/documents", label: "Document Advisor", icon: FileSearch },
    { href: "/workflow", label: "AI Workflow Analyzer", icon: Bot },
  ] },
];

function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} aria-label="Fintel Hub 2.0 home" title="Go to dashboard" className="flex items-center gap-2.5 rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-lg shadow-indigo-900/30">
        <Zap className="h-5 w-5 text-amber-300" fill="currentColor" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">Fintel Hub <span className="text-amber-300">2.0</span></div>
        <div className="text-[11px] text-indigo-200/70">Financial Intelligence Platform</div>
      </div>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const ai = useAiStatus();
  const alias = useActiveAlias();
  return (
    <div className="flex h-full flex-col bg-[#0f1330] text-slate-300">
      <div className="px-5 pb-6 pt-5">
        <Logo onNavigate={onNavigate} />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        {NAV.map((g) => (
          <div key={g.section}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.section}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
                const Icon = it.icon;
                const off = Boolean(it.module && alias && !alias.modules.includes(it.module));
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={onNavigate}
                    className={clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                      active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                      off && !active && "opacity-50",
                    )}
                    title={off ? `Not enabled for ${alias?.name}` : undefined}
                  >
                    <Icon className={clsx("h-4 w-4", active ? "text-amber-300" : "text-slate-500 group-hover:text-slate-300")} />
                    <span className="flex-1">{it.label}</span>
                    {off && <Lock className="h-3 w-3 text-slate-500" />}
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

function AliasSwitcher() {
  const aliases = useStore((s) => s.aliases);
  const activeId = useStore((s) => s.activeAliasId);
  const setActive = useStore((s) => s.setActiveAlias);
  const alias = useActiveAlias();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path, activeId]);
  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-left hover:bg-slate-50 sm:max-w-[340px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch alias"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: alias?.color ?? "#cbd5e1" }} />
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase leading-none tracking-wider text-muted">Alias</span>
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{alias?.name ?? "No alias selected"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-line bg-white shadow-xl" role="listbox">
            <div className="max-h-72 overflow-y-auto p-1">
              {aliases.map((a) => (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={a.id === activeId}
                  onClick={() => setActive(a.id)}
                  className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-50", a.id === activeId && "bg-brand-soft")}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-[11px] text-muted">{a.docIds.length} doc(s) · {a.modules.length === 5 ? "Full analysis" : a.modules.length + " module(s)"}</span>
                  </span>
                </button>
              ))}
              {!aliases.length && <div className="px-3 py-4 text-center text-[12px] text-muted">No aliases yet</div>}
            </div>
            <div className="grid grid-cols-2 gap-1 border-t border-line p-1">
              <Link href="/vault?new=1" className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium text-brand hover:bg-brand-soft"><Plus className="h-3.5 w-3.5" />New alias</Link>
              <Link href="/vault" className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium text-muted hover:bg-slate-50 hover:text-ink"><Settings2 className="h-3.5 w-3.5" />Manage & vault</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const ds = useDataset();
  const hydrated = useHydrated();
  const range = ds.periods.length ? `${ds.periods[0]} → ${ds.periods[ds.periods.length - 1]}` : "no statements yet";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
      <button className="rounded-lg p-1.5 text-muted hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {hydrated && (
          <>
            <AliasSwitcher />
            {ds.isSample && <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline">Demo data</span>}
            <span className="hidden truncate text-[12px] text-muted xl:inline">{ds.company} · {ds.lines.length} line items · {range}{ds.periods.length ? ` · ${ds.granularity}ly` : ""}</span>
          </>
        )}
      </div>
      <Link href="/data" className="hidden h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white shadow-sm hover:bg-indigo-700 sm:inline-flex">
        <FileUp className="h-4 w-4" /> Upload
      </Link>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const hydrated = useHydrated();
  const activeId = useStore((s) => s.activeAliasId);
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
          {hydrated ? (
            // Re-mount pages when the alias changes so no settings carry over from another analysis.
            <div key={activeId ?? "none"} className="fade-up"><ModuleGate>{children}</ModuleGate></div>
          ) : <LoadingSkeleton />}
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
