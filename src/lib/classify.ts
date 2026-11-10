import type { Category } from "./types";

interface Rule {
  category: Category;
  group: string;
  patterns: RegExp[];
  weight: number;
}

/**
 * Keyword rules for classifying statement lines. Order does not matter: the
 * highest-weight matching rule wins. Subtotal detection runs first.
 */
const SUBTOTAL = [
  /\btotal\b/i,
  /\bgross (profit|margin)\b/i,
  /\bnet (income|profit|loss|earnings)\b/i,
  /\boperating (income|profit|loss)\b/i,
  /\bebitda?\b/i,
  /\bprofit before\b/i,
  /\bincome before\b/i,
  /\bsubtotal\b/i,
  /\bretained earnings\b/i,
];

const RULES: Rule[] = [
  // ---- Revenue
  { category: "revenue", group: "Product sales", weight: 3, patterns: [/\b(product|merchandise|goods) (sales|revenue)\b/i, /\bsales\b/i] },
  { category: "revenue", group: "Service revenue", weight: 3, patterns: [/\bservice(s)? (revenue|income|fees)\b/i, /\bconsulting (revenue|fees|income)\b/i, /\bprofessional fees? (earned|income)\b/i] },
  { category: "revenue", group: "Subscription revenue", weight: 3, patterns: [/\bsubscription/i, /\brecurring revenue\b/i, /\bsaas\b/i, /\blicen[cs]e (revenue|fees|income)\b/i] },
  { category: "revenue", group: "Revenue", weight: 2, patterns: [/\brevenue\b/i, /\bturnover\b/i, /\bfees earned\b/i, /\bcommission income\b/i] },
  { category: "revenue", group: "Discounts & returns", weight: 4, patterns: [/\b(sales )?returns\b/i, /\bdiscounts? (given|allowed)\b/i, /\ballowances\b/i] },
  // ---- Other income
  { category: "other_income", group: "Interest income", weight: 5, patterns: [/\binterest (income|earned|received)\b/i] },
  { category: "other_income", group: "Investment income", weight: 5, patterns: [/\bdividend/i, /\binvestment (income|gain)/i, /\bgain on (sale|disposal)/i, /\bunrealized gain\b/i, /\bfx gain\b/i, /\bforeign exchange gain\b/i] },
  { category: "other_income", group: "Rental income", weight: 5, patterns: [/\brent(al)? income\b/i, /\bsublease\b/i] },
  { category: "other_income", group: "Grants & subsidies", weight: 5, patterns: [/\bgrant(s)?\b/i, /\bsubsid/i, /\btax credit/i] },
  { category: "other_income", group: "Other income", weight: 4, patterns: [/\bother (income|revenue)\b/i, /\bmisc(ellaneous)? income\b/i, /\broyalt(y|ies) income\b/i] },
  // ---- COGS
  { category: "cogs", group: "Cost of goods sold", weight: 5, patterns: [/\bcost of (goods|sales|revenue|services)\b/i, /\bcogs\b/i, /\bdirect (materials?|labou?r|costs?)\b/i, /\braw materials?\b/i, /\binventory\b/i, /\bpurchases\b/i, /\bmanufacturing\b/i, /\bfreight[- ]in\b/i] },
  // ---- Variable opex
  { category: "opex_variable", group: "Sales commissions", weight: 5, patterns: [/\bcommission(s)?( expense)?\b/i] },
  { category: "opex_variable", group: "Shipping & fulfilment", weight: 5, patterns: [/\bshipping\b/i, /\bfreight\b/i, /\bpostage\b/i, /\bdelivery\b/i, /\bfulfil+ment\b/i, /\bpackaging\b/i] },
  { category: "opex_variable", group: "Payment processing", weight: 5, patterns: [/\b(merchant|payment|card|transaction|processing|stripe|paypal) (fees|charges)\b/i, /\bbank charges\b/i] },
  { category: "opex_variable", group: "Marketing & advertising", weight: 4, patterns: [/\badvertis/i, /\bmarketing\b/i, /\bpromotion/i, /\bads?\b/i, /\bpaid (search|social)\b/i] },
  { category: "opex_variable", group: "Contractors & temp labor", weight: 4, patterns: [/\bcontract(or)? (labou?r|services)\b/i, /\bfreelanc/i, /\btemp(orary)? (staff|labou?r)\b/i, /\boutsourc/i, /\bhourly wages\b/i, /\bovertime\b/i] },
  { category: "opex_variable", group: "Supplies & consumables", weight: 3, patterns: [/\bsupplies\b/i, /\bconsumables\b/i] },
  { category: "opex_variable", group: "Utilities (usage)", weight: 3, patterns: [/\butilit(y|ies)\b/i, /\belectric/i, /\bpower\b/i, /\bwater\b/i, /\bgas\b/i, /\bfuel\b/i] },
  { category: "opex_variable", group: "Cloud & usage-based", weight: 3, patterns: [/\bhosting\b/i, /\bcloud\b/i, /\baws\b/i, /\bazure\b/i, /\bapi usage\b/i] },
  { category: "opex_variable", group: "Travel", weight: 3, patterns: [/\btravel\b/i, /\bmeals\b/i, /\bentertainment\b/i, /\bmileage\b/i] },
  // ---- Fixed opex
  { category: "opex_fixed", group: "Payroll", weight: 4, patterns: [/\bsalar(y|ies)\b/i, /\bwages\b/i, /\bpayroll\b/i, /\bemployee benefits?\b/i, /\bbenefits\b/i, /\bhealth insurance\b/i, /\b401k\b/i, /\bpension\b/i, /\bbonus(es)?\b/i, /\bstaff costs?\b/i, /\bpersonnel\b/i] },
  { category: "opex_fixed", group: "Occupancy", weight: 5, patterns: [/\brent\b/i, /\blease\b/i, /\boccupancy\b/i, /\bproperty tax/i, /\bfacilit/i] },
  { category: "opex_fixed", group: "Insurance", weight: 5, patterns: [/\binsurance\b/i] },
  { category: "opex_fixed", group: "Depreciation & amortization", weight: 6, patterns: [/\bdepreciation\b/i, /\bamorti[sz]ation\b/i] },
  { category: "opex_fixed", group: "Software & subscriptions", weight: 4, patterns: [/\bsoftware\b/i, /\bsaas tools?\b/i, /\bsubscriptions? expense\b/i, /\blicen[cs]es?\b/i, /\bit (services|expense)\b/i] },
  { category: "opex_fixed", group: "Professional services", weight: 4, patterns: [/\blegal\b/i, /\baccounting\b/i, /\baudit\b/i, /\bprofessional (fees|services)\b/i, /\bconsulting (fees|expense)\b/i, /\bbookkeeping\b/i] },
  { category: "opex_fixed", group: "Telecom & internet", weight: 4, patterns: [/\btelephone\b/i, /\bphone\b/i, /\binternet\b/i, /\btelecom/i, /\bmobile\b/i] },
  { category: "opex_fixed", group: "Repairs & maintenance", weight: 3, patterns: [/\brepairs?\b/i, /\bmaintenance\b/i, /\bjanitorial\b/i, /\bcleaning\b/i] },
  { category: "opex_fixed", group: "Admin & office", weight: 2, patterns: [/\boffice\b/i, /\badmin(istrative)?\b/i, /\bdues\b/i, /\bmemberships?\b/i, /\btraining\b/i, /\blicenses? and permits\b/i, /\bgeneral\b/i] },
  // ---- Non-operating
  { category: "non_operating", group: "Interest expense", weight: 6, patterns: [/\binterest expense\b/i, /\bloan interest\b/i, /\bfinance (costs?|charges)\b/i, /\binterest paid\b/i] },
  { category: "non_operating", group: "Other non-operating", weight: 5, patterns: [/\bloss on (sale|disposal)/i, /\bimpairment\b/i, /\bfx loss\b/i, /\bforeign exchange loss\b/i, /\bother expense\b/i, /\bwrite[- ]off\b/i] },
  // ---- Tax
  { category: "tax", group: "Income tax", weight: 6, patterns: [/\bincome tax/i, /\btax expense\b/i, /\bprovision for (income )?tax/i, /\bcorporate tax\b/i] },
];

export interface Classification {
  category: Category;
  group: string;
  confidence: number;
}

export function classifyLine(name: string): Classification {
  const n = name.trim();
  if (!n) return { category: "ignore", group: "Unlabelled", confidence: 0.2 };
  if (SUBTOTAL.some((r) => r.test(n))) return { category: "ignore", group: "Subtotal", confidence: 0.9 };

  let best: Rule | null = null;
  let bestScore = 0;
  let matches = 0;
  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(n)).length;
    if (!hits) continue;
    matches++;
    const score = rule.weight + hits * 0.5;
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  if (!best) {
    // Unknown cost-sounding line → fixed opex with low confidence.
    if (/expense|cost|fee|charge/i.test(n)) return { category: "opex_fixed", group: "Other operating", confidence: 0.35 };
    return { category: "opex_fixed", group: "Unclassified", confidence: 0.2 };
  }
  const confidence = Math.min(0.97, 0.45 + bestScore / 14 - (matches > 2 ? 0.1 : 0));
  return { category: best.category, group: best.group, confidence };
}
