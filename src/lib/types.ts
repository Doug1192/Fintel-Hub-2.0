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
