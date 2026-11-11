"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, Check, ChevronDown, ChevronRight, FileText, FolderPlus, Link2Off, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, Field, inputCls, PageHeader, Segmented } from "@/components/ui";
import { PreviewTable } from "@/components/PreviewTable";
import { useStore } from "@/store/useStore";
import { aliasesForDoc, generalVault } from "@/lib/aliases";
import { docById } from "@/lib/documents";
import { fmtMoney, periodLabel } from "@/lib/format";
import { ALL_MODULES, CATEGORY_META, MODULE_PRESETS, MODULES, type Alias, type ModuleKey, type VaultDoc } from "@/lib/types";

type Notice = { tone: "good" | "warn" | "bad"; text: string } | null;

export default function VaultPage() {
  const router = useRouter();
  const { aliases, docs, activeAliasId, createAlias, updateAlias, deleteAlias, setActiveAlias, attachDoc, detachDoc, deleteDoc } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"vault" | "all">("vault");
  const [notice, setNotice] = useState<Notice>(null);

  // Open the "new alias" form when arriving from the alias switcher (?new=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      setShowNew(true);
      // Clear the flag so the form doesn't reopen when the page re-mounts for the new alias.
      window.history.replaceState(null, "", "/vault");
    }
  }, []);

  const unassigned = useMemo(() => generalVault(docs, aliases), [docs, aliases]);
  const listed = tab === "vault" ? unassigned : docs;

  const openAlias = (a: Alias) => {
    setActiveAlias(a.id);
    const first = ALL_MODULES.find((m) => a.modules.includes(m));
    const needsData = first ? MODULES[first].needsStatements : false;
    router.push(!first || (needsData && !a.dataset.lines.length) ? "/data" : MODULES[first].href);
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Aliases & vault"
        subtitle="An alias is a named workspace for one analysis or check, with its own documents, data and features, so multiple uploads never get mixed up. Every upload is also kept in the vault. Anything not yet assigned waits in the General Vault until you add it to an alias."
        right={
          <>
            <Link href="/data"><Button variant="secondary"><UploadCloud className="h-4 w-4" />Upload</Button></Link>
            <Button onClick={() => setShowNew((v) => !v)}><FolderPlus className="h-4 w-4" />New alias</Button>
          </>
        }
      />

      {notice && <div className="mb-4"><Callout tone={notice.tone}><div className="flex items-center justify-between gap-2"><span>{notice.text}</span><button className="text-[12px] font-medium underline" onClick={() => setNotice(null)}>Dismiss</button></div></Callout></div>}

      {showNew && (
        <NewAliasForm
          onCancel={() => setShowNew(false)}
          onCreate={(name, modules, description) => {
            createAlias(name, modules, description);
            setShowNew(false);
            setNotice({ tone: "good", text: `Alias “${name || "New alias"}” created and selected. Add documents to it from the vault below, or upload new ones.` });
          }}
        />
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Aliases <span className="font-normal text-muted">({aliases.length})</span></h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {aliases.map((a) => (
          <AliasCard
            key={a.id}
            alias={a}
            active={a.id === activeAliasId}
            docs={docs.filter((d) => a.docIds.includes(d.id))}
            onOpen={() => openAlias(a)}
            onUpdate={(patch) => updateAlias(a.id, patch)}
            onDetach={(docId) => detachDoc(docId, a.id)}
            onDelete={() => {
              if (confirm(`Delete alias “${a.name}”? Its documents stay in the vault; only this workspace and its classifications are removed.`)) deleteAlias(a.id);
            }}
          />
        ))}
        <button onClick={() => setShowNew(true)} className="grid min-h-[180px] place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-muted transition hover:border-brand hover:text-brand">
          <span className="flex flex-col items-center gap-2 text-[13px] font-medium"><Plus className="h-6 w-6" />Create an alias</span>
        </button>
      </div>

      <Card className="mt-8">
        <CardHeader
          icon={<Archive className="h-4 w-4" />}
          title="Document vault"
          subtitle="Pick any document and add it to an alias. A document can serve several aliases."
          right={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "vault", label: `General Vault (${unassigned.length})` }, { value: "all", label: `All documents (${docs.length})` }]} />}
        />
        {listed.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-muted">
            {tab === "vault" ? (docs.length ? "Every document is assigned to an alias. Nothing is waiting in the General Vault." : "No documents yet.") : "No documents yet."}{" "}
            <Link href="/data" className="font-medium text-brand hover:underline">Upload one</Link>.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {listed.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                aliases={aliases}
                onAttach={(aliasId, mode) => {
                  const r = attachDoc(d.id, aliasId, mode);
                  const an = aliases.find((a) => a.id === aliasId)?.name;
                  setNotice(r.ok ? { tone: r.warnings.length ? "warn" : "good", text: `“${d.name}” added to ${an}. ${r.warnings.join(" ")}` } : { tone: "bad", text: r.error ?? "Couldn't add the document." });
                }}
                onDetach={(aliasId) => detachDoc(d.id, aliasId)}
                onDelete={() => {
                  const used = aliasesForDoc(d.id, aliases);
                  if (confirm(`Delete “${d.name}” permanently?${used.length ? ` It will also be removed from ${used.map((a) => a.name).join(", ")}.` : ""}`)) deleteDoc(d.id);
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ModulePicker({ value, onChange }: { value: ModuleKey[]; onChange: (m: ModuleKey[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_MODULES.map((m) => {
        const on = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== m) : [...value, m])}
            className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition", on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink")}
            aria-pressed={on}
          >
            {on && <Check className="h-3 w-3" />}{MODULES[m].label}
          </button>
        );
      })}
    </div>
  );
}

function NewAliasForm({ onCreate, onCancel }: { onCreate: (name: string, modules: ModuleKey[], description?: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modules, setModules] = useState<ModuleKey[]>(ALL_MODULES);
  const preset = MODULE_PRESETS.find((p) => p.modules.length === modules.length && p.modules.every((m) => modules.includes(m)));
  return (
    <Card className="mb-6 ring-2 ring-indigo-100">
      <CardHeader icon={<FolderPlus className="h-4 w-4" />} title="New alias" subtitle="Name it after the analysis or check it's for." />
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Alias name"><input autoFocus className={inputCls} placeholder="e.g. FY2025 performance review" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description (optional)"><input className={inputCls} placeholder="What this alias is for" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1 text-[12px] font-medium text-muted">What will you use it for?</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULE_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => setModules(p.modules)} className={clsx("rounded-xl border p-3 text-left transition", preset?.id === p.id ? "border-brand bg-brand-soft/60" : "border-line hover:bg-slate-50")}>
                <div className="text-[13px] font-semibold">{p.label}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">{p.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 text-[12px] font-medium text-muted">Or choose features individually</div>
          <div className="mt-1.5"><ModulePicker value={modules} onChange={setModules} /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!modules.length} onClick={() => onCreate(name.trim() || "New alias", modules, description.trim() || undefined)}><FolderPlus className="h-4 w-4" />Create alias</Button>
      </div>
    </Card>
  );
}

function AliasCard({ alias, active, docs, onOpen, onUpdate, onDetach, onDelete }: {
  alias: Alias; active: boolean; docs: VaultDoc[];
  onOpen: () => void; onUpdate: (p: Partial<Pick<Alias, "name" | "description" | "modules">>) => void; onDetach: (docId: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const ds = alias.dataset;
  return (
    <Card className={clsx("flex flex-col overflow-hidden", active && "ring-2 ring-brand")}>
      <div className="h-1" style={{ background: alias.color }} />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <input autoFocus className={clsx(inputCls, "h-8")} defaultValue={alias.name} onBlur={(e) => { onUpdate({ name: e.target.value.trim() || alias.name }); setEditing(false); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
          ) : (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{alias.name}</span>
                {active && <Badge tone="brand">Current</Badge>}
              </div>
              {alias.description && <div className="mt-0.5 text-[12px] text-muted">{alias.description}</div>}
            </div>
          )}
          <div className="flex shrink-0 gap-0.5">
            <button className="rounded p-1 text-slate-400 hover:text-ink" onClick={() => setEditing(true)} aria-label="Rename alias" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
            <button className="rounded p-1 text-slate-400 hover:text-bad" onClick={onDelete} aria-label="Delete alias" title="Delete alias"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 py-2"><div className="tabular text-[15px] font-semibold">{docs.length}</div><div className="text-[10.5px] text-muted">documents</div></div>
          <div className="rounded-lg bg-slate-50 py-2"><div className="tabular text-[15px] font-semibold">{ds.lines.length}</div><div className="text-[10.5px] text-muted">line items</div></div>
          <div className="rounded-lg bg-slate-50 py-2"><div className="tabular text-[15px] font-semibold">{ds.periods.length}</div><div className="text-[10.5px] text-muted">periods</div></div>
        </div>
        {ds.periods.length > 0 && <div className="mt-2 text-[11.5px] text-muted">{periodLabel(ds.periods[0])} → {periodLabel(ds.periods[ds.periods.length - 1])} · {ds.granularity}ly{ds.isSample ? " · demo data" : ""}</div>}
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Features</div>
        <div className="mt-1.5"><ModulePicker value={alias.modules} onChange={(m) => m.length && onUpdate({ modules: m })} /></div>
        {docs.length > 0 && (
          <button className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink" onClick={() => setShowDocs((v) => !v)}>
            {showDocs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Documents
          </button>
        )}
        {showDocs && (
          <ul className="mt-1 space-y-1">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-[12px]">
                <span className="truncate">{d.name}</span>
                <button className="text-slate-400 hover:text-warn" onClick={() => onDetach(d.id)} title="Remove from alias (stays in vault)" aria-label={`Remove ${d.name} from alias`}><Link2Off className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-line p-3">
        <Button className="w-full" variant={active ? "primary" : "secondary"} size="sm" onClick={onOpen}>{active ? "Continue" : "Open alias"}<ArrowRight className="h-3.5 w-3.5" /></Button>
      </div>
    </Card>
  );
}

function DocRow({ doc, aliases, onAttach, onDetach, onDelete }: {
  doc: VaultDoc; aliases: Alias[];
  onAttach: (aliasId: string, mode: "merge" | "replace") => void; onDetach: (aliasId: string) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const inAliases = aliasesForDoc(doc.id, aliases);
  const available = aliases.filter((a) => !a.docIds.includes(doc.id));
  const pickAlias = aliases.find((a) => a.id === pick);
  const content = doc.items.length
    ? `${doc.items.length} lines · ${doc.periods.length} ${doc.granularity} period(s)${doc.periods.length ? ` · ${periodLabel(doc.periods[0])}${doc.periods.length > 1 ? " → " + periodLabel(doc.periods[doc.periods.length - 1]) : ""}` : ""}`
    : doc.via === "legacy" ? "Added before aliases (contents already in its alias)" : "Reference document";
  return (
    <div className="px-5 py-3">
      <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-3">
          <button className="mt-0.5 rounded p-0.5 text-slate-400 hover:text-ink" onClick={() => setOpen((v) => !v)} aria-label={open ? "Hide contents" : "Show contents"} aria-expanded={open}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{doc.name}</div>
            <div className="text-[11.5px] text-muted">{docById(doc.kind)?.name ?? "Document"} · {content} · added {new Date(doc.addedAt).toLocaleDateString()}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {inAliases.length === 0 && <Badge tone="warn">General Vault</Badge>}
              {inAliases.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />{a.name}
                  <button className="text-slate-400 hover:text-warn" onClick={() => onDetach(a.id)} title="Remove from this alias" aria-label={`Remove from ${a.name}`}><Link2Off className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {available.length > 0 && (
            <>
              <select aria-label={`Add ${doc.name} to an alias`} className="h-8 rounded-lg border border-line bg-white px-2 text-[12.5px]" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add to alias…</option>
                {available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {pickAlias && doc.items.length > 0 && pickAlias.dataset.lines.length > 0 && !pickAlias.dataset.isSample && (
                <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "merge", label: "Add" }, { value: "replace", label: "Replace" }]} />
              )}
              <Button size="sm" disabled={!pick} onClick={() => { onAttach(pick, mode); setPick(""); setMode("merge"); }}>Add</Button>
            </>
          )}
          <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-bad" onClick={onDelete} title="Delete document" aria-label={`Delete ${doc.name}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {doc.items.length > 0 ? (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-[12px]">
                <tbody className="divide-y divide-line">
                  {doc.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-1.5">{it.name}</td>
                      <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[it.category].color }} />{CATEGORY_META[it.category].short}</span></td>
                      <td className="tabular px-3 py-1.5 text-right text-muted">{fmtMoney(it.values.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : doc.preview?.length ? (
            <PreviewTable rows={doc.preview} />
          ) : (
            <div className="px-4 py-4 text-[12.5px] text-muted">{doc.notes ?? "No preview available."}</div>
          )}
        </div>
      )}
    </div>
  );
}
