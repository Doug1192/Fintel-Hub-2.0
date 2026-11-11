"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Archive, FileUp, FolderPlus, Lock } from "lucide-react";
import { useActiveAlias, useStore } from "@/store/useStore";
import { MODULES, type ModuleKey } from "@/lib/types";
import { Button, Card } from "./ui";

function moduleForPath(path: string): ModuleKey | null {
  for (const [key, m] of Object.entries(MODULES) as [ModuleKey, (typeof MODULES)[ModuleKey]][]) {
    if (m.href === "/" ? path === "/" : path.startsWith(m.href)) return key;
  }
  return null;
}

function Panel({ icon, title, body, children }: { icon: ReactNode; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <Card className="mx-auto mt-6 max-w-xl px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</div>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </Card>
  );
}

/**
 * Shows a page only when it makes sense for the active alias: an alias must be
 * selected, the module must be switched on for it, and statement-based modules need data.
 */
export function ModuleGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const alias = useActiveAlias();
  const updateAlias = useStore((s) => s.updateAlias);
  const mod = moduleForPath(path);
  const needsAlias = mod !== null;

  if (needsAlias && !alias) {
    return (
      <Panel icon={<FolderPlus className="h-6 w-6" />} title="Choose an alias first" body="Each analysis lives in its own alias, so uploads for different checks never get mixed up. Create one, or pick an existing alias from the switcher at the top.">
        <Link href="/vault?new=1"><Button><FolderPlus className="h-4 w-4" />Create an alias</Button></Link>
        <Link href="/vault"><Button variant="secondary"><Archive className="h-4 w-4" />Open the vault</Button></Link>
      </Panel>
    );
  }
  if (!mod || !alias) return <>{children}</>;

  const meta = MODULES[mod];
  if (!alias.modules.includes(mod)) {
    return (
      <Panel
        icon={<Lock className="h-6 w-6" />}
        title={`${meta.label} is off for “${alias.name}”`}
        body={<>This alias is set up for {alias.modules.map((m) => MODULES[m].label).join(", ") || "no analysis yet"}. Turn {meta.label} on if you need it here, or switch to another alias.</>}
      >
        <Button onClick={() => updateAlias(alias.id, { modules: [...alias.modules, mod] })}>Turn on {meta.label}</Button>
        <Link href="/vault"><Button variant="secondary">Manage aliases</Button></Link>
      </Panel>
    );
  }
  if (meta.needsStatements && !alias.dataset.lines.length) {
    return (
      <Panel icon={<FileUp className="h-6 w-6" />} title={`No statements in “${alias.name}” yet`} body={`${meta.label} works from income-statement data. Upload a statement to this alias, or add one you've already uploaded from the General Vault.`}>
        <Link href="/data"><Button><FileUp className="h-4 w-4" />Upload to this alias</Button></Link>
        <Link href="/vault"><Button variant="secondary"><Archive className="h-4 w-4" />Add from vault</Button></Link>
      </Panel>
    );
  }
  return <>{children}</>;
}
