export interface DocType {
  id: string;
  name: string;
  what: string;
  source: string;
  detect: RegExp;
}

export const DOC_TYPES: DocType[] = [
  { id: "income_statement", name: "Income statement (P&L)", what: "Revenue, cost of sales, operating expenses and net income by period.", source: "Accounting system (QuickBooks, Xero, NetSuite) → Reports → Profit & Loss", detect: /(p\s*&\s*l|p&l|pnl|profit.?(and|&).?loss|income.?statement|statement of operations)/i },
  { id: "balance_sheet", name: "Balance sheet", what: "Assets, liabilities and equity at period end.", source: "Accounting system → Reports → Balance Sheet", detect: /(balance.?sheet|financial position|assets.*liabilities)/i },
  { id: "cash_flow", name: "Cash flow statement", what: "Operating, investing and financing cash flows.", source: "Accounting system → Statement of Cash Flows", detect: /(cash.?flow)/i },
  { id: "general_ledger", name: "General ledger / trial balance", what: "Every transaction by account; needed for detailed cost classification.", source: "Accounting system → General Ledger or Trial Balance export (CSV)", detect: /(general.?ledger|\bgl\b|trial.?balance|journal)/i },
  { id: "sales_report", name: "Sales report by product / customer", what: "Units, prices and revenue by product, customer or channel.", source: "POS, e-commerce platform or CRM sales export", detect: /(sales.?(report|by|detail)|orders|invoices?.?(list|register)|revenue.?by)/i },
  { id: "payroll", name: "Payroll register & headcount", what: "Salaries, wages, benefits and headcount by role or department.", source: "Payroll provider (ADP, Gusto, Paychex) → Payroll summary", detect: /(payroll|headcount|wages|salar)/i },
  { id: "budget", name: "Budget / prior forecast", what: "Planned figures to compare against actuals.", source: "FP&A team or management spreadsheets", detect: /(budget|forecast|plan\b)/i },
  { id: "ar_aging", name: "Accounts receivable aging", what: "Unpaid customer invoices grouped by age.", source: "Accounting system → A/R Aging Summary", detect: /(a\/?r.?aging|receivable)/i },
  { id: "ap_aging", name: "Accounts payable aging", what: "Unpaid supplier bills grouped by age.", source: "Accounting system → A/P Aging Summary", detect: /(a\/?p.?aging|payable)/i },
  { id: "inventory", name: "Inventory valuation report", what: "Stock on hand, unit costs and turnover.", source: "Inventory / ERP system", detect: /(inventory|stock.?(on.?hand|valuation))/i },
  { id: "bank_statements", name: "Bank statements", what: "Monthly statements for all business accounts.", source: "Bank portal → Statements (PDF)", detect: /(bank.?statement|statement.?of.?account)/i },
  { id: "tax_returns", name: "Business tax returns", what: "Filed federal and state returns (e.g. 1120, 1120-S, 1065, Schedule C).", source: "Tax preparer or IRS transcript", detect: /(tax.?return|1120|1065|schedule.?c)/i },
  { id: "price_list", name: "Price list & cost sheet", what: "Current list prices, discounts and unit costs per product or service.", source: "Sales / product team", detect: /(price.?list|pricing|cost.?sheet|bom|bill of materials)/i },
  { id: "customer_metrics", name: "Customer metrics (CAC, churn, retention)", what: "New customers, churned customers, acquisition spend and cohort retention.", source: "CRM, subscription billing (Stripe, Chargebee) or marketing analytics", detect: /(churn|cohort|retention|cac\b|customer.?metrics)/i },
  { id: "market_data", name: "Competitor & market pricing", what: "Competitor price points and market size estimates.", source: "Market research, competitor websites, industry reports", detect: /(competitor|market.?(research|size|data))/i },
  { id: "debt_schedule", name: "Debt & loan schedule", what: "Outstanding loans, rates, maturities and covenants.", source: "Loan agreements / lender statements", detect: /(debt|loan|amorti[sz]ation.?schedule|covenant)/i },
  { id: "cap_table", name: "Cap table", what: "Ownership by shareholder, options and convertibles.", source: "Carta / legal counsel", detect: /(cap.?table|capitali[sz]ation table)/i },
  { id: "contracts", name: "Key contracts & leases", what: "Major customer, supplier and lease agreements.", source: "Legal / operations files", detect: /(contract|agreement|lease)/i },
  { id: "fixed_assets", name: "Fixed asset register", what: "Equipment and property, cost, depreciation schedule.", source: "Accounting system → Fixed Asset report", detect: /(fixed.?asset|asset.?register|depreciation.?schedule)/i },
  { id: "org_chart", name: "Org chart & job descriptions", what: "Roles, reporting lines and responsibilities.", source: "HR", detect: /(org.?chart|job.?description|roles)/i },
  { id: "process_docs", name: "Process maps / SOPs", what: "Step-by-step descriptions of how work is done today, with time per step.", source: "Operations team", detect: /(sop|process|procedure|workflow)/i },
  { id: "kpi_ops", name: "Operational data (capacity, utilisation)", what: "Production capacity, utilisation, hours worked, output per employee.", source: "Operations / ERP / time-tracking", detect: /(capacity|utili[sz]ation|timesheet|time.?tracking)/i },
];

export type Need = "required" | "recommended";

export interface AnalysisTask {
  id: string;
  name: string;
  summary: string;
  keywords: string[];
  docs: { id: string; need: Need; period: string; why: string }[];
  module?: { href: string; label: string };
}

export const TASKS: AnalysisTask[] = [
  {
    id: "profitability", name: "Profitability & KPI review", summary: "Understand margins, cost structure and what drives profit.",
    keywords: ["profit", "margin", "kpi", "performance", "dashboard", "review"],
    module: { href: "/", label: "Open Dashboard" },
    docs: [
      { id: "income_statement", need: "required", period: "Last 24 months, monthly", why: "Core source for revenue, COGS and operating expenses." },
      { id: "general_ledger", need: "recommended", period: "Same period", why: "Lets every expense be classified as fixed or variable accurately." },
      { id: "sales_report", need: "recommended", period: "Same period", why: "Shows which products and customers drive margin." },
      { id: "payroll", need: "recommended", period: "Latest 12 months", why: "Needed for revenue per employee and labour cost analysis." },
    ],
  },
  {
    id: "cost_structure", name: "Fixed vs variable cost analysis", summary: "Separate fixed and variable costs; compute contribution margin and break-even.",
    keywords: ["fixed", "variable", "cost", "break-even", "breakeven", "contribution", "overhead"],
    module: { href: "/data", label: "Review classification" },
    docs: [
      { id: "income_statement", need: "required", period: "At least 12 months, monthly", why: "Monthly variation shows which costs move with sales." },
      { id: "general_ledger", need: "required", period: "Same period", why: "Account-level detail is needed to split mixed costs." },
      { id: "sales_report", need: "recommended", period: "Same period, with units", why: "Unit volumes let you compute variable cost per unit." },
      { id: "contracts", need: "recommended", period: "Current", why: "Leases and fixed-fee contracts confirm which costs are committed." },
    ],
  },
  {
    id: "forecast", name: "Revenue & profit forecast", summary: "Project revenue, costs and profit monthly, quarterly or yearly.",
    keywords: ["forecast", "projection", "predict", "future", "outlook", "trend"],
    module: { href: "/forecast", label: "Open Forecast" },
    docs: [
      { id: "income_statement", need: "required", period: "24–36 months, monthly (to capture seasonality)", why: "Statistical models need at least two full seasonal cycles." },
      { id: "budget", need: "recommended", period: "Current year", why: "Management targets to benchmark against." },
      { id: "sales_report", need: "recommended", period: "Same period", why: "Pipeline and product-level trends improve accuracy." },
      { id: "contracts", need: "recommended", period: "Current", why: "Known future commitments such as price escalators and lease step-ups." },
    ],
  },
  {
    id: "cash_flow", name: "Cash flow forecast & working capital", summary: "Predict cash position; optimise receivables, payables and inventory.",
    keywords: ["cash", "liquidity", "working capital", "runway", "burn"],
    docs: [
      { id: "cash_flow", need: "required", period: "Last 12–24 months", why: "Baseline operating cash generation." },
      { id: "balance_sheet", need: "required", period: "Last 2 period ends", why: "Working capital positions and changes." },
      { id: "ar_aging", need: "required", period: "Current", why: "Timing of cash coming in." },
      { id: "ap_aging", need: "required", period: "Current", why: "Timing of cash going out." },
      { id: "bank_statements", need: "recommended", period: "Last 3–6 months", why: "Confirms actual cash balances." },
      { id: "debt_schedule", need: "recommended", period: "Current", why: "Principal and interest payments." },
    ],
  },
  {
    id: "pricing", name: "Pricing strategy review", summary: "Test whether a pricing strategy pays off over the long run.",
    keywords: ["price", "pricing", "discount", "premium", "elasticity", "ltv", "cac"],
    module: { href: "/pricing", label: "Open Pricing Lab" },
    docs: [
      { id: "price_list", need: "required", period: "Current", why: "Current prices, discounts and unit costs." },
      { id: "sales_report", need: "required", period: "24 months, including any past price changes", why: "Volume response to past price changes gives you elasticity." },
      { id: "customer_metrics", need: "required", period: "12–24 months", why: "Churn, CAC and retention drive lifetime value." },
      { id: "market_data", need: "recommended", period: "Current", why: "Competitor positioning sets the price ceiling and floor." },
      { id: "income_statement", need: "recommended", period: "12 months", why: "Fixed cost base for break-even." },
    ],
  },
  {
    id: "sensitivity", name: "Sensitivity, scenario & goal-seek analysis", summary: "What-ifs, and reverse planning for profit or revenue targets.",
    keywords: ["sensitivity", "scenario", "what if", "what-if", "target", "goal", "reverse"],
    module: { href: "/scenarios", label: "Open Scenarios" },
    docs: [
      { id: "income_statement", need: "required", period: "12 months", why: "Baseline P&L to flex." },
      { id: "sales_report", need: "recommended", period: "12 months, with units", why: "Separates price effects from volume effects." },
      { id: "payroll", need: "recommended", period: "Current", why: "Headcount and loaded cost for workforce levers." },
      { id: "kpi_ops", need: "recommended", period: "12 months", why: "Capacity limits for realistic volume increases." },
    ],
  },
  {
    id: "optimization", name: "Optimization (product mix, budget allocation)", summary: "Find the best decision under constraints with linear programming.",
    keywords: ["optimi", "allocate", "allocation", "mix", "constraint", "maximi", "minimi", "linear programming"],
    module: { href: "/optimize", label: "Open Optimizer" },
    docs: [
      { id: "price_list", need: "required", period: "Current", why: "Objective coefficients (price, margin per unit)." },
      { id: "kpi_ops", need: "required", period: "Current", why: "Constraint limits (machine hours, labour hours, capacity)." },
      { id: "sales_report", need: "recommended", period: "12 months", why: "Demand caps per product." },
      { id: "inventory", need: "recommended", period: "Current", why: "Material availability constraints." },
    ],
  },
  {
    id: "loan", name: "Bank loan / credit application", summary: "Package the documents lenders ask for.",
    keywords: ["loan", "credit", "bank", "lender", "financing", "sba", "debt"],
    docs: [
      { id: "income_statement", need: "required", period: "Last 3 fiscal years + year-to-date", why: "Lenders assess earnings and debt service capacity." },
      { id: "balance_sheet", need: "required", period: "Last 3 year ends + latest", why: "Leverage and liquidity ratios." },
      { id: "tax_returns", need: "required", period: "Last 3 years", why: "Independent check of reported income." },
      { id: "bank_statements", need: "required", period: "Last 6–12 months", why: "Verifies cash flow and balances." },
      { id: "debt_schedule", need: "required", period: "Current", why: "Existing obligations and covenants." },
      { id: "ar_aging", need: "recommended", period: "Current", why: "Needed for asset-based lines of credit." },
      { id: "cash_flow", need: "recommended", period: "12-month projection", why: "Shows ability to repay." },
    ],
  },
  {
    id: "valuation", name: "Business valuation", summary: "Estimate enterprise value (DCF, multiples).",
    keywords: ["valuation", "value", "worth", "dcf", "multiple", "sell", "exit"],
    docs: [
      { id: "income_statement", need: "required", period: "3–5 years historical", why: "Normalised earnings and EBITDA." },
      { id: "balance_sheet", need: "required", period: "Latest + 3 year ends", why: "Net debt and working capital." },
      { id: "cash_flow", need: "required", period: "3–5 years", why: "Free cash flow for DCF." },
      { id: "budget", need: "required", period: "3–5 year projection", why: "Future cash flows to discount." },
      { id: "cap_table", need: "recommended", period: "Current", why: "Equity value per share." },
      { id: "contracts", need: "recommended", period: "Current", why: "Customer concentration and contract quality." },
      { id: "market_data", need: "recommended", period: "Current", why: "Comparable company multiples." },
    ],
  },
  {
    id: "fundraising", name: "Investor pitch / fundraising", summary: "Financial package for equity investors.",
    keywords: ["investor", "pitch", "fundraising", "raise", "venture", "equity", "seed", "series"],
    docs: [
      { id: "income_statement", need: "required", period: "All history, monthly", why: "Growth trajectory." },
      { id: "budget", need: "required", period: "3-year model", why: "Use of funds and path to profitability." },
      { id: "customer_metrics", need: "required", period: "All cohorts", why: "Unit economics (LTV/CAC, retention)." },
      { id: "cap_table", need: "required", period: "Current", why: "Ownership and dilution." },
      { id: "balance_sheet", need: "recommended", period: "Latest", why: "Cash position and liabilities." },
      { id: "market_data", need: "recommended", period: "Current", why: "Market size (TAM/SAM/SOM)." },
    ],
  },
  {
    id: "tax", name: "Tax preparation", summary: "Gather what your accountant needs to file.",
    keywords: ["tax", "irs", "filing", "return", "deduction"],
    docs: [
      { id: "income_statement", need: "required", period: "Full fiscal year", why: "Taxable income starting point." },
      { id: "balance_sheet", need: "required", period: "Fiscal year end", why: "Required schedules (e.g. Schedule L)." },
      { id: "general_ledger", need: "required", period: "Full fiscal year", why: "Supports deductions." },
      { id: "fixed_assets", need: "required", period: "Full fiscal year", why: "Tax depreciation (MACRS, Section 179)." },
      { id: "payroll", need: "required", period: "Full fiscal year", why: "Payroll tax reconciliation (W-2, 941)." },
      { id: "tax_returns", need: "recommended", period: "Prior year", why: "Carryforwards and consistency." },
    ],
  },
  {
    id: "audit", name: "Audit readiness", summary: "Prepare for a financial statement audit or review.",
    keywords: ["audit", "review", "compliance", "gaap", "ifrs"],
    docs: [
      { id: "general_ledger", need: "required", period: "Fiscal year", why: "Auditors tie every balance to the ledger." },
      { id: "income_statement", need: "required", period: "Fiscal year + prior year", why: "Statements under audit." },
      { id: "balance_sheet", need: "required", period: "Fiscal year end + prior", why: "Statements under audit." },
      { id: "cash_flow", need: "required", period: "Fiscal year", why: "Statements under audit." },
      { id: "bank_statements", need: "required", period: "All 12 months", why: "Cash confirmation and reconciliations." },
      { id: "ar_aging", need: "required", period: "Year end", why: "Receivables testing." },
      { id: "fixed_assets", need: "required", period: "Year end", why: "Additions, disposals, depreciation." },
      { id: "contracts", need: "recommended", period: "Current", why: "Revenue recognition and lease accounting." },
    ],
  },
  {
    id: "workforce", name: "Workforce efficiency & AI opportunities", summary: "Find where to streamline roles and use AI.",
    keywords: ["workforce", "staff", "employee", "efficiency", "ai", "automation", "job", "role", "productivity", "process"],
    module: { href: "/workflow", label: "Open Workflow Analyzer" },
    docs: [
      { id: "org_chart", need: "required", period: "Current", why: "Shows each role's responsibilities." },
      { id: "process_docs", need: "required", period: "Current", why: "Step-level detail to spot automation." },
      { id: "payroll", need: "recommended", period: "12 months", why: "Puts a cost on time saved." },
      { id: "kpi_ops", need: "recommended", period: "12 months", why: "Baseline output and utilisation." },
    ],
  },
];

export function detectDocType(name: string, sample = ""): string {
  const hay = name + " " + sample.slice(0, 3000);
  for (const d of DOC_TYPES) if (d.detect.test(name)) return d.id;
  for (const d of DOC_TYPES) if (d.detect.test(hay)) return d.id;
  return "income_statement";
}

export function docById(id: string) {
  return DOC_TYPES.find((d) => d.id === id);
}

/** Keyword match free text to the most relevant analysis tasks. */
export function matchTasks(query: string): AnalysisTask[] {
  const q = query.toLowerCase();
  if (!q.trim()) return [];
  return TASKS.map((t) => ({ t, score: t.keywords.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0) + (q.includes(t.name.toLowerCase()) ? 20 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}
