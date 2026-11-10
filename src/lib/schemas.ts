/** JSON Schemas for structured AI outputs. Every object lists all properties as required and forbids extras. */
type S = Record<string, unknown>;
const obj = (properties: Record<string, S>): S => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = (description?: string): S => (description ? { type: "string", description } : { type: "string" });
const num = (description?: string): S => (description ? { type: "number", description } : { type: "number" });
const arr = (items: S): S => ({ type: "array", items });
const en = (values: string[]): S => ({ type: "string", enum: values });

export const WORKFLOW_SCHEMA = obj({
  title: str(),
  summary: str("2-3 sentence executive summary"),
  automationScore: num("0-100 overall share of the work that AI or automation could take on"),
  hoursSavedPerWeek: num(),
  tasks: arr(obj({
    task: str("the task, in a short sentence"),
    category: str(),
    automationPotential: num("0-100"),
    approach: en(["automate", "augment", "keep_human", "eliminate"]),
    aiSolution: str("specific, practical recommendation"),
    tools: arr(str()),
    effort: en(["low", "medium", "high"]),
  })),
  efficiencyImprovements: arr(obj({ title: str(), detail: str(), impact: en(["high", "medium", "low"]) })),
  roadmap: arr(obj({ phase: str(), items: arr(str()) })),
  risks: arr(str()),
});

export const EXTRACT_SCHEMA = obj({
  company: str("company name if shown, else empty string"),
  granularity: en(["month", "quarter", "year"]),
  periods: arr(str("period key: YYYY-MM for months, YYYY-Qn for quarters, YYYY for years; oldest first")),
  lines: arr(obj({
    name: str("line item label exactly as written"),
    category: en(["revenue", "other_income", "cogs", "opex_fixed", "opex_variable", "non_operating", "tax", "ignore"]),
    group: str("short sub-group such as Payroll, Occupancy, Product sales"),
    values: arr(num("one value per period, in the same order as periods; costs as positive numbers")),
  })),
  notes: str("anything the user should double-check"),
});

export const INSIGHTS_SCHEMA = obj({
  headline: str("one-sentence verdict on performance"),
  insights: arr(obj({ tone: en(["good", "warn", "bad", "info"]), title: str(), detail: str() })),
  actions: arr(obj({ action: str(), impact: str("estimated impact in money or percent where possible"), priority: en(["high", "medium", "low"]) })),
});

export const DOCUMENTS_SCHEMA = obj({
  taskName: str(),
  summary: str(),
  docs: arr(obj({ name: str(), need: en(["required", "recommended"]), period: str("what time span and frequency"), why: str(), source: str("where to get it") })),
  tips: arr(str()),
});

export const OPTIMIZE_SCHEMA = obj({
  title: str(),
  direction: en(["max", "min"]),
  objectiveName: str("e.g. Profit, Cost"),
  variables: arr(obj({ name: str("short identifier, no spaces"), label: str(), objective: num("objective coefficient"), min: num(), max: { type: ["number", "null"] }, integer: { type: "boolean" } })),
  constraints: arr(obj({
    name: str(),
    terms: arr(obj({ variable: str(), coefficient: num() })),
    relation: en(["<=", ">=", "="]),
    rhs: num(),
  })),
  notes: str("assumptions you made"),
});
