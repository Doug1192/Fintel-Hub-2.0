export type Category =
  | "revenue"
  | "other_income"
  | "cogs"
  | "opex_fixed"
  | "opex_variable"
  | "non_operating"
  | "tax"
  | "ignore";

export const CATEGORY_META: Record<
  Category,
  { label: string; short: string; color: string; kind: "income" | "cost" | "none" }
> = {
  revenue: { label: "Revenue", short: "Revenue", color: "#2563eb", kind: "income" },
  other_income: { label: "Other income", short: "Other inc.", color: "#0891b2", kind: "income" },
  cogs: { label: "Cost of goods sold (variable)", short: "COGS", color: "#d97706", kind: "cost" },
  opex_variable: { label: "Variable operating expense", short: "Variable", color: "#ea580c", kind: "cost" },
  opex_fixed: { label: "Fixed operating expense", short: "Fixed", color: "#7c3aed", kind: "cost" },
  non_operating: { label: "Interest & non-operating expense", short: "Non-op", color: "#64748b", kind: "cost" },
  tax: { label: "Income tax", short: "Tax", color: "#475569", kind: "cost" },
  ignore: { label: "Ignore (subtotal / not P&L)", short: "Ignored", color: "#cbd5e1", kind: "none" },
};

export const CATEGORY_ORDER: Category[] = [
  "revenue",
  "other_income",
  "cogs",
  "opex_variable",
  "opex_fixed",
  "non_operating",
  "tax",
  "ignore",
];

export type Granularity = "month" | "quarter" | "year";

export interface LineItem {
  id: string;
  name: string;
  category: Category;
  /** Sub-group label, e.g. "Payroll", "Occupancy", "Product sales". */
  group: string;
  /** One value per dataset period, always stored as a positive magnitude for costs. */
  values: number[];
  /** 0..1 classifier confidence. 1 = set by the user. */
  confidence: number;
  source?: string;
  /** Vault document this line came from (used to detach a document from an alias). */
  docId?: string;
}

export interface UploadedDoc {
  id: string;
  name: string;
  size: number;
  kind: string; // detected document type id, see documents.ts
  addedAt: string;
  linesExtracted: number;
}

export interface Dataset {
  company: string;
  currency: string;
  /** Period keys: YYYY-MM for months, YYYY-Qn for quarters, YYYY for years. */
  periods: string[];
  granularity: Granularity;
  lines: LineItem[];
  /** Optional operating facts used by workforce / pricing tools. */
  headcount?: number;
  isSample?: boolean;
}

export interface PeriodSummary {
  period: string;
  revenue: number;
  otherIncome: number;
  cogs: number;
  variable: number;
  fixed: number;
  nonOperating: number;
  tax: number;
  grossProfit: number;
  contribution: number;
  operatingIncome: number;
  netIncome: number;
}

/** Analysis modules an alias can switch on. Data, Documents and Workflow are always available. */
export type ModuleKey = "dashboard" | "forecast" | "scenarios" | "pricing" | "optimize";

export const MODULES: Record<ModuleKey, { label: string; href: string; needsStatements: boolean }> = {
  dashboard: { label: "Dashboard", href: "/", needsStatements: true },
  forecast: { label: "Forecast", href: "/forecast", needsStatements: true },
  scenarios: { label: "Sensitivity & Goal Seek", href: "/scenarios", needsStatements: true },
  pricing: { label: "Pricing Lab", href: "/pricing", needsStatements: false },
  optimize: { label: "Optimizer", href: "/optimize", needsStatements: false },
};

export const ALL_MODULES = Object.keys(MODULES) as ModuleKey[];

export const MODULE_PRESETS: { id: string; label: string; description: string; modules: ModuleKey[] }[] = [
  { id: "full", label: "Full analysis", description: "Every analysis feature: dashboard, forecast, scenarios, pricing and optimizer.", modules: ALL_MODULES },
  { id: "optimization", label: "Optimization only", description: "Just the Optimizer. Documents are kept as reference; no statement analysis.", modules: ["optimize"] },
  { id: "pricing", label: "Pricing review", description: "Pricing Lab plus the dashboard.", modules: ["dashboard", "pricing"] },
  { id: "forecast", label: "Forecast & planning", description: "Dashboard, forecast and scenarios.", modules: ["dashboard", "forecast", "scenarios"] },
];

/** A document saved in the vault. It can belong to any number of aliases (or none: the General Vault). */
export interface VaultDoc {
  id: string;
  name: string;
  size: number;
  kind: string; // detected document type id, see documents.ts
  addedAt: string;
  via: "parser" | "ai" | "legacy";
  /** Parsed statement content; empty for reference-only documents. */
  periods: string[];
  granularity: Granularity;
  items: LineItem[];
  /** First rows of the raw table, for reference documents (e.g. capacity sheets used by the Optimizer). */
  preview?: string[][];
  notes?: string;
}

/** A named workspace ("alias") that keeps one analysis separate from another. */
export interface Alias {
  id: string;
  name: string;
  color: string;
  description?: string;
  modules: ModuleKey[];
  dataset: Dataset;
  docIds: string[];
  /** Saved Optimizer model for this alias (shape defined in optimize.ts). */
  optModel?: unknown;
  createdAt: string;
}
