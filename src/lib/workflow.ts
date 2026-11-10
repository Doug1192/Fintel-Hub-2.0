export type Approach = "automate" | "augment" | "keep_human" | "eliminate";

export interface WorkflowTask {
  task: string;
  category: string;
  automationPotential: number; // 0-100
  approach: Approach;
  aiSolution: string;
  tools: string[];
  effort: "low" | "medium" | "high";
}

export interface WorkflowAnalysis {
  title: string;
  summary: string;
  automationScore: number;
  hoursSavedPerWeek: number;
  tasks: WorkflowTask[];
  efficiencyImprovements: { title: string; detail: string; impact: "high" | "medium" | "low" }[];
  roadmap: { phase: string; items: string[] }[];
  risks: string[];
  source: "ai" | "rules";
}

interface Pattern {
  category: string;
  re: RegExp;
  potential: number;
  approach: Approach;
  solution: string;
  tools: string[];
  effort: WorkflowTask["effort"];
}

const PATTERNS: Pattern[] = [
  { category: "Data entry & processing", re: /\b(data entry|enter|input|key in|record|update (the )?(records|spreadsheet|system)|transcrib|copy|migrat)/i, potential: 90, approach: "automate", solution: "Capture data automatically with integrations or document AI, so nobody re-keys it.", tools: ["Document AI / OCR", "RPA (UiPath, Power Automate)", "API integrations"], effort: "medium" },
  { category: "Document processing", re: /\b(invoice|receipt|purchase order|form|contract review|extract|scan|paperwork|documents?)\b/i, potential: 85, approach: "automate", solution: "Use an LLM with document understanding to extract, validate and route documents, with people reviewing the exceptions.", tools: ["Claude (document understanding)", "OCR", "Workflow engine"], effort: "medium" },
  { category: "Reconciliation & checking", re: /\b(reconcil|match|verify|validate|check|audit|review (transactions|entries))/i, potential: 80, approach: "automate", solution: "Use rule-based matching plus AI anomaly flags, so people only handle the mismatches.", tools: ["Accounting automation (BlackLine, Xero rules)", "Anomaly detection"], effort: "medium" },
  { category: "Reporting", re: /\b(report|dashboard|kpi|metrics|summar|month[- ]end|weekly update|status update|presentation|slides)/i, potential: 80, approach: "automate", solution: "Build live dashboards and have an LLM draft the written commentary for a person to approve.", tools: ["BI (Power BI, Looker)", "Claude for narrative drafts", "Scheduled exports"], effort: "low" },
  { category: "Scheduling & coordination", re: /\b(schedul|calendar|book|coordinate|arrange|meetings?|appointments?|roster|shift)/i, potential: 75, approach: "automate", solution: "Use self-service booking and an AI scheduling assistant.", tools: ["Calendly / Microsoft Bookings", "AI scheduling assistant"], effort: "low" },
  { category: "Communication & correspondence", re: /\b(email|respond|correspond|reply|inquir|follow[- ]up|call|phone|chat|communicat|notify)/i, potential: 65, approach: "augment", solution: "Have AI triage the inbox and draft replies from templates and knowledge-base answers, with a person approving them.", tools: ["Claude for drafting", "Help desk (Zendesk, Intercom) with AI", "Email templates"], effort: "low" },
  { category: "Customer support", re: /\b(customer (service|support)|tickets?|complaints?|helpdesk|help desk|support requests?)/i, potential: 70, approach: "augment", solution: "An AI assistant answers routine questions instantly and hands complex cases to people with full context.", tools: ["AI support agent", "Knowledge base", "Ticketing system"], effort: "medium" },
  { category: "Research & information gathering", re: /\b(research|gather|collect information|look up|investigate|monitor|track (competitors|market))/i, potential: 70, approach: "augment", solution: "An AI research assistant gathers and summarises sources, and a person checks the conclusions.", tools: ["Claude with web search", "Alerts & monitoring"], effort: "low" },
  { category: "Analysis & forecasting", re: /\b(analy[sz]|forecast|model|budget|variance|projection|evaluate|assess)/i, potential: 55, approach: "augment", solution: "Run baseline forecasts and variance explanations automatically, so analysts focus on interpretation and decisions.", tools: ["Fintel Hub forecasting", "Python / BI", "Claude for variance commentary"], effort: "medium" },
  { category: "Writing & content", re: /\b(write|draft|prepare (documents|proposals)|proposal|content|copy|documentation|policy|policies|sop)/i, potential: 65, approach: "augment", solution: "An LLM drafts first versions from templates and past examples, and a person edits and approves them.", tools: ["Claude", "Template library"], effort: "low" },
  { category: "Invoicing & payments", re: /\b(billing|invoic(e|ing) customers|payments?|collections?|accounts (payable|receivable)|payroll|expense)/i, potential: 80, approach: "automate", solution: "Automate billing runs, payment reminders and expense approvals inside the accounting system.", tools: ["Bill.com / Ramp", "Accounting system automation", "Automated dunning"], effort: "medium" },
  { category: "Inventory & procurement", re: /\b(inventory|stock|order(ing)? supplies|procure|purchas|vendor|supplier)/i, potential: 65, approach: "automate", solution: "Reorder automatically from forecast demand and reorder points.", tools: ["Inventory management system", "Demand forecasting"], effort: "medium" },
  { category: "Leadership & people management", re: /\b(manage|lead|supervis|mentor|coach|hire|recruit|train(ing)? staff|motivat|performance reviews?)/i, potential: 20, approach: "keep_human", solution: "Keep this with people. AI can help with interview scheduling, review drafts and training content.", tools: ["AI drafting for reviews", "ATS automation"], effort: "low" },
  { category: "Strategy & decision-making", re: /\b(strateg|decid|decision|negotiat|approve|prioriti[sz]|plan(ning)?\b|vision)/i, potential: 25, approach: "keep_human", solution: "Keep this with people, supported by AI scenario analysis and briefing documents.", tools: ["Scenario modelling", "AI briefings"], effort: "low" },
  { category: "Relationship & sales", re: /\b(relationship|client meetings?|sell|sales calls?|prospect|network|partner(ship)?s?|stakeholder)/i, potential: 30, approach: "augment", solution: "Keep relationships with people. AI handles CRM updates, call notes, lead scoring and prospect research.", tools: ["CRM with AI (HubSpot, Salesforce)", "Call transcription"], effort: "low" },
  { category: "Physical / on-site work", re: /\b(lift|install|repair|drive|deliver|inspect on[- ]site|operate (machinery|equipment)|clean|assemble|pack)/i, potential: 15, approach: "keep_human", solution: "Mostly physical work. Look at routing optimisation, mobile checklists and predictive maintenance.", tools: ["Route optimisation", "Mobile forms", "IoT sensors"], effort: "high" },
];

const ELIMINATE = /\b(manually|duplicate|re-?enter|print(ing)? and scan|chase|chasing|wait(ing)? for approval|multiple spreadsheets|paper)\b/i;

export function splitTasks(text: string): string[] {
  const parts = text
    .split(/\r?\n|•|·|;|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((s) => s.length > 12 && s.split(" ").length >= 3);
  // Drop generic headings like "Responsibilities:"
  const isHeading = (s: string) =>
    /^(responsibilities|requirements|qualifications|about|duties|skills)\b.{0,20}:?$/i.test(s) ||
    /^(job title|title|position|role|department|reports to|location)\s*:/i.test(s) ||
    /:\s*$/.test(s);
  return [...new Set(parts.filter((s) => !isHeading(s)))].slice(0, 30);
}

export function analyzeWorkflowRules(text: string, hoursPerWeek = 40): WorkflowAnalysis {
  const lines = splitTasks(text);
  const tasks: WorkflowTask[] = lines.map((line) => {
    const hits = PATTERNS.filter((p) => p.re.test(line));
    const p = hits.sort((a, b) => b.potential - a.potential)[0];
    const manual = ELIMINATE.test(line);
    if (!p) {
      return { task: line, category: "General", automationPotential: 35, approach: "augment", aiSolution: "Write this task down as a standard procedure first, then see which steps a template or AI assistant can do.", tools: ["SOP documentation", "Claude"], effort: "low" };
    }
    return {
      task: line,
      category: p.category,
      automationPotential: Math.min(98, p.potential + (manual ? 8 : 0)),
      approach: manual && p.approach !== "keep_human" ? "eliminate" : p.approach,
      aiSolution: manual ? `Remove the manual step entirely: ${p.solution.charAt(0).toLowerCase()}${p.solution.slice(1)}` : p.solution,
      tools: p.tools,
      effort: p.effort,
    };
  });
  const avg = tasks.length ? tasks.reduce((a, t) => a + t.automationPotential, 0) / tasks.length : 0;
  // Assume equal time per task; automate saves ~70% of the task's time, augment ~35%, eliminate ~90%.
  const factor: Record<Approach, number> = { automate: 0.7, augment: 0.35, eliminate: 0.9, keep_human: 0.05 };
  const share = tasks.length ? hoursPerWeek / tasks.length : 0;
  const hours = tasks.reduce((a, t) => a + share * factor[t.approach] * (t.automationPotential / 100), 0);

  const byCat = new Map<string, number>();
  tasks.forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + 1));
  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

  const improvements: WorkflowAnalysis["efficiencyImprovements"] = [];
  if (tasks.some((t) => t.approach === "eliminate")) improvements.push({ title: "Remove manual re-work", detail: "Several steps re-enter or chase information by hand. Connect the systems so data flows once.", impact: "high" });
  if (byCat.get("Reporting")) improvements.push({ title: "Report once, read everywhere", detail: "Replace recurring manual reports with one live dashboard and an auto-drafted summary.", impact: "high" });
  if (byCat.get("Communication & correspondence") || byCat.get("Customer support")) improvements.push({ title: "Templates and triage", detail: "Group similar requests, use reply templates, and let AI handle first-line routing.", impact: "medium" });
  if (byCat.get("Scheduling & coordination")) improvements.push({ title: "Self-service scheduling", detail: "Let people book directly from shared availability to remove back-and-forth emails.", impact: "medium" });
  improvements.push({ title: "Batch similar work", detail: "Group similar tasks into fixed time blocks to cut context switching (often 15–25% of the day).", impact: "medium" });
  improvements.push({ title: "Define clear handoffs", detail: "Document inputs, outputs and owners for each step so work doesn't wait on approvals.", impact: "medium" });

  const quick = tasks.filter((t) => t.effort === "low" && t.automationPotential >= 60).map((t) => t.task);
  const mid = tasks.filter((t) => t.effort !== "low" && t.automationPotential >= 60).map((t) => t.task);
  const human = tasks.filter((t) => t.approach === "keep_human").map((t) => t.task);

  return {
    title: "Workflow efficiency assessment",
    summary: tasks.length
      ? `Found ${tasks.length} distinct tasks. Overall automation potential is about ${Math.round(avg)}%, concentrated in ${topCats.join(", ").toLowerCase()}. With the suggested changes, roughly ${hours.toFixed(1)} of ${hoursPerWeek} hours a week could go to higher-value work.`
      : "No tasks could be identified. Paste a job description or describe the process one step per line.",
    automationScore: Math.round(avg),
    hoursSavedPerWeek: Math.round(hours * 10) / 10,
    tasks,
    efficiencyImprovements: improvements,
    roadmap: [
      { phase: "Quick wins (0–30 days)", items: quick.length ? quick.slice(0, 5) : ["Standardise templates for recurring outputs"] },
      { phase: "Process automation (1–3 months)", items: mid.length ? mid.slice(0, 5) : ["Connect source systems to remove manual data transfer"] },
      { phase: "Keep human, add AI support", items: human.length ? human.slice(0, 5) : ["Judgement-heavy decisions stay with people, supported by AI briefings"] },
    ],
    risks: [
      "Validate AI outputs: keep a person reviewing anything financial or customer-facing.",
      "Protect sensitive data: use approved tools with data retention controls.",
      "Measure before and after (cycle time, error rate) to confirm the gains.",
    ],
    source: "rules",
  };
}
