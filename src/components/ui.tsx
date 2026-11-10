"use client";

import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Info, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right, eyebrow }: { title: string; subtitle?: ReactNode; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Button({
  children, variant = "primary", size = "md", className, loading, ...rest
}: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-brand text-white shadow-sm hover:bg-indigo-700",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-slate-50",
        variant === "ghost" && "text-muted hover:bg-slate-100 hover:text-ink",
        variant === "danger" && "border border-red-200 bg-white text-bad hover:bg-red-50",
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "warn" | "bad" | "info"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-600",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "good" && "bg-emerald-50 text-emerald-700",
        tone === "warn" && "bg-amber-50 text-amber-700",
        tone === "bad" && "bg-red-50 text-red-700",
        tone === "info" && "bg-sky-50 text-sky-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kpi({
  label, value, delta, deltaLabel, hint, accent, invertDelta,
}: { label: string; value: string; delta?: number | null; deltaLabel?: string; hint?: string; accent?: string; invertDelta?: boolean }) {
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  return (
    <Card className="relative overflow-hidden p-4">
      {accent && <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />}
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-slate-400">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="tabular mt-1.5 text-[22px] font-semibold tracking-tight text-ink">{value}</div>
      {delta !== undefined && delta !== null && isFinite(delta) && (
        <div className={clsx("mt-1 inline-flex items-center gap-0.5 text-[12px] font-medium", good ? "text-good" : "text-bad")}>
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {(Math.abs(delta) * 100).toFixed(1)}%<span className="ml-1 font-normal text-muted">{deltaLabel ?? "vs prior year"}</span>
        </div>
      )}
    </Card>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-slate-50 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md font-medium transition disabled:opacity-40",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label, value, onChange, min, max, step, format, hint,
}: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-medium text-ink" title={hint}>{label}</span>
        <span className={clsx("tabular rounded-md px-1.5 py-0.5 text-[12px] font-semibold", value === 0 ? "text-muted" : value > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
          {format(value)}
        </span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted" title={hint}>{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-indigo-100";

export function NumInput({ value, onChange, step = 1, min, max, className }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; className?: string }) {
  return (
    <input
      type="number"
      className={clsx(inputCls, "tabular", className)}
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="grid place-items-center px-6 py-16 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "good" | "warn" | "bad"; title?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-[13px]",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "bad" && "border-red-200 bg-red-50 text-red-900",
      )}
    >
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}
