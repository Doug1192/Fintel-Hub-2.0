import { weightedAverageConstraint, type OptModel } from "./optimize";

export interface OptTemplate {
  id: string;
  label: string;
  group: "lab" | "practice" | "business";
  /** Short problem statement shown above the model. */
  problem?: string;
  model: OptModel;
  /** Known correct answer to compare against. */
  expected?: {
    source: string;
    objective: number;
    values?: Record<string, number>;
    note?: string;
  };
}

const GRADES = [1, 2, 3, 4, 5];
const SUPPLY = [90, 225, 300, 100, 75];

export const TEMPLATES: OptTemplate[] = [
  // ------------------------------------------------------------------ Module 1 lab (Excel Solver)
  {
    id: "lab-p1",
    label: "P1 · Molokai Nut Company",
    group: "lab",
    problem:
      "Choose how many pounds of Whole, Cluster, Crunch and Roasted to make next week to maximize profit (selling price − variable cost per lb). Demand: Whole ≥ 1,000 lb, Cluster 400–500 lb, Crunch ≤ 150 lb, Roasted ≤ 200 lb. Nut content is 60%, 40%, 20% and 100% (the rest is chocolate); 1,100 lb of nuts and 800 lb of chocolate are available. Each machine has 60 hours (3,600 minutes).",
    model: {
      title: "Molokai Nut Company",
      direction: "max",
      objectiveName: "Weekly profit ($)",
      nonNegative: true,
      variables: [
        { name: "Whole", label: "Whole (lb)", objective: 1.85, min: 1000, max: null, integer: false },
        { name: "Cluster", label: "Cluster (lb)", objective: 1.4, min: 400, max: 500, integer: false },
        { name: "Crunch", label: "Crunch (lb)", objective: 1.04, min: 0, max: 150, integer: false },
        { name: "Roasted", label: "Roasted (lb)", objective: 1.4, min: 0, max: 200, integer: false },
      ],
      constraints: [
        { name: "Nuts available (lb)", terms: { Whole: 0.6, Cluster: 0.4, Crunch: 0.2, Roasted: 1 }, relation: "<=", rhs: 1100 },
        { name: "Chocolate available (lb)", terms: { Whole: 0.4, Cluster: 0.6, Crunch: 0.8, Roasted: 0 }, relation: "<=", rhs: 800 },
        { name: "Hulling (min)", terms: { Whole: 1, Cluster: 1, Crunch: 1, Roasted: 1 }, relation: "<=", rhs: 3600 },
        { name: "Roasting (min)", terms: { Whole: 2, Cluster: 1.5, Crunch: 1, Roasted: 1.75 }, relation: "<=", rhs: 3600 },
        { name: "Coating (min)", terms: { Whole: 1, Cluster: 0.7, Crunch: 0.2, Roasted: 0 }, relation: "<=", rhs: 3600 },
        { name: "Packaging (min)", terms: { Whole: 2.5, Cluster: 1.6, Crunch: 1.25, Roasted: 1 }, relation: "<=", rhs: 3600 },
      ],
      notes: "Objective coefficients are selling price minus variable cost: Whole 5.00 − 3.15 = 1.85, Cluster 4.00 − 2.60 = 1.40, Crunch 3.20 − 2.16 = 1.04, Roasted 4.50 − 3.10 = 1.40. Machine time is 60 h × 60 = 3,600 minutes.",
    },
    expected: {
      source: "Excel Solver (your Module 1 workbook)",
      objective: 2913.2,
      values: { Whole: 1000, Cluster: 500, Crunch: 80, Roasted: 200 },
    },
  },
  {
    id: "lab-p2",
    label: "P2 · Theme park shift scheduling",
    group: "lab",
    problem:
      "8-hour maintenance shifts start every 4 hours (12 a.m., 4 a.m., 8 a.m., 12 p.m., 4 p.m., 8 p.m.), so each 4-hour period is covered by the shift that starts then and the one that started 4 hours earlier. Minimum staff per period: 90, 215, 250, 165, 300, 125. Minimize the total number of employees scheduled.",
    model: {
      title: "Theme park maintenance scheduling",
      direction: "min",
      objectiveName: "Total employees",
      nonNegative: true,
      variables: [
        { name: "S12am", label: "Shift starting 12 a.m.", objective: 1, min: 0, max: null, integer: false },
        { name: "S4am", label: "Shift starting 4 a.m.", objective: 1, min: 0, max: null, integer: false },
        { name: "S8am", label: "Shift starting 8 a.m.", objective: 1, min: 0, max: null, integer: false },
        { name: "S12pm", label: "Shift starting 12 p.m.", objective: 1, min: 0, max: null, integer: false },
        { name: "S4pm", label: "Shift starting 4 p.m.", objective: 1, min: 0, max: null, integer: false },
        { name: "S8pm", label: "Shift starting 8 p.m.", objective: 1, min: 0, max: null, integer: false },
      ],
      constraints: [
        { name: "12 a.m.–4 a.m.", terms: { S8pm: 1, S12am: 1 }, relation: ">=", rhs: 90 },
        { name: "4 a.m.–8 a.m.", terms: { S12am: 1, S4am: 1 }, relation: ">=", rhs: 215 },
        { name: "8 a.m.–12 p.m.", terms: { S4am: 1, S8am: 1 }, relation: ">=", rhs: 250 },
        { name: "12 p.m.–4 p.m.", terms: { S8am: 1, S12pm: 1 }, relation: ">=", rhs: 165 },
        { name: "4 p.m.–8 p.m.", terms: { S12pm: 1, S4pm: 1 }, relation: ">=", rhs: 300 },
        { name: "8 p.m.–12 a.m.", terms: { S4pm: 1, S8pm: 1 }, relation: ">=", rhs: 125 },
      ],
      notes: "Solved as an LP like the Excel model; the optimal solution comes out in whole employees anyway. Mark the variables Integer to require it.",
    },
    expected: {
      source: "Excel Solver (your Module 1 workbook)",
      objective: 640,
      values: { S12am: 90, S4am: 125, S8am: 125, S12pm: 40, S4pm: 260, S8pm: 0 },
      note: "This problem has several optimal schedules. Any schedule with 640 employees that covers every period is equally correct.",
    },
  },
  {
    id: "lab-p3",
    label: "P3 · Holiday Fruit Company",
    group: "lab",
    problem:
      "Split each grade of oranges (1 = lowest … 5 = highest; supply 90, 225, 300, 100, 75 thousand lb) between fruit baskets ($2.50/lb profit) and fresh juice ($1.75/lb). Baskets must average grade ≥ 3.75 and juice must average grade ≥ 2.50. Maximize profit.",
    model: {
      title: "Holiday Fruit Company",
      direction: "max",
      objectiveName: "Total profit ($1000s)",
      nonNegative: true,
      variables: [
        ...GRADES.map((g) => ({ name: `Basket_G${g}`, label: `Grade ${g} → baskets (1000 lb)`, objective: 2.5, min: 0, max: null, integer: false })),
        ...GRADES.map((g) => ({ name: `Juice_G${g}`, label: `Grade ${g} → juice (1000 lb)`, objective: 1.75, min: 0, max: null, integer: false })),
      ],
      constraints: [
        ...GRADES.map((g, i) => ({ name: `Grade ${g} supply`, terms: { [`Basket_G${g}`]: 1, [`Juice_G${g}`]: 1 }, relation: "<=" as const, rhs: SUPPLY[i] })),
        weightedAverageConstraint("Basket average grade", GRADES.map((g) => ({ variable: `Basket_G${g}`, attribute: g })), ">=", 3.75, "grade"),
        weightedAverageConstraint("Juice average grade", GRADES.map((g) => ({ variable: `Juice_G${g}`, attribute: g })), ">=", 2.5, "grade"),
      ],
      notes: "Average-grade rules are ratios, (Σ grade × lbs) ÷ (Σ lbs) ≥ target. Multiplying both sides by the total pounds gives the linear form Σ(grade − target) × lbs ≥ 0, the same as the Excel model's SUMPRODUCT(grade, lbs) ≥ target × total lbs.",
    },
    expected: {
      source: "Excel Solver (your Module 1 workbook)",
      objective: 1526.5,
      values: { Basket_G1: 0, Basket_G2: 61.5, Basket_G3: 0, Basket_G4: 55.5, Basket_G5: 75, Juice_G1: 90, Juice_G2: 163.5, Juice_G3: 300, Juice_G4: 44.5, Juice_G5: 0 },
      note: "Several grade splits reach the same profit: 192K lb to baskets and 598K lb to juice. Any of them is equally correct.",
    },
  },

  // ------------------------------------------------------------------ More practice (checked with Python/SciPy)
  {
    id: "lab-p4",
    label: "P4 · Bank asset allocation",
    group: "practice",
    problem:
      "Allocate $650,000 among bonds (10%), mortgages (8.5%), car loans (9.5%) and personal loans (12.5%) to maximize expected return. Personal loans ≤ 25% of the portfolio; more in mortgages than personal loans; more in bonds than personal loans.",
    model: {
      title: "Bank asset allocation",
      direction: "max",
      objectiveName: "Expected annual return ($)",
      nonNegative: true,
      variables: [
        { name: "Bonds", label: "Bonds ($)", objective: 0.1, min: 0, max: null, integer: false },
        { name: "Mortgages", label: "Home mortgages ($)", objective: 0.085, min: 0, max: null, integer: false },
        { name: "Car", label: "Car loans ($)", objective: 0.095, min: 0, max: null, integer: false },
        { name: "Personal", label: "Personal loans ($)", objective: 0.125, min: 0, max: null, integer: false },
      ],
      constraints: [
        { name: "Total invested", terms: { Bonds: 1, Mortgages: 1, Car: 1, Personal: 1 }, relation: "=", rhs: 650000 },
        { name: "Personal ≤ 25% of portfolio", terms: { Bonds: -0.25, Mortgages: -0.25, Car: -0.25, Personal: 0.75 }, relation: "<=", rhs: 0, note: "Personal ≤ 25% of (Bonds + Mortgages + Car + Personal)" },
        { name: "Mortgages ≥ personal loans", terms: { Mortgages: 1, Personal: -1 }, relation: ">=", rhs: 0 },
        { name: "Bonds ≥ personal loans", terms: { Bonds: 1, Personal: -1 }, relation: ">=", rhs: 0 },
      ],
      notes: "“More than” is modelled as ≥ (LP can't use strict inequalities).",
    },
    expected: { source: "Python (SciPy / HiGHS)", objective: 66625, values: { Bonds: 325000, Mortgages: 162500, Car: 0, Personal: 162500 } },
  },
  {
    id: "lab-p5",
    label: "P5 · Valu-Com product mix",
    group: "practice",
    problem:
      "Choose production of five interface cards to maximize profit (price − cost) given PC board, resistors, memory chips and assembly hours. At least 500 of each card, and at least twice as many FastLink as HyperLink.",
    model: {
      title: "Valu-Com Electronics",
      direction: "max",
      objectiveName: "Profit ($)",
      nonNegative: true,
      variables: [
        { name: "HyperLink", label: "HyperLink (units)", objective: 53, min: 500, max: null, integer: false },
        { name: "FastLink", label: "FastLink (units)", objective: 48, min: 500, max: null, integer: false },
        { name: "SpeedLink", label: "SpeedLink (units)", objective: 33, min: 500, max: null, integer: false },
        { name: "MicroLink", label: "MicroLink (units)", objective: 32, min: 500, max: null, integer: false },
        { name: "EtherLink", label: "EtherLink (units)", objective: 38, min: 500, max: null, integer: false },
      ],
      constraints: [
        { name: "PC board (sq in)", terms: { HyperLink: 20, FastLink: 15, SpeedLink: 10, MicroLink: 8, EtherLink: 5 }, relation: "<=", rhs: 80000 },
        { name: "Resistors", terms: { HyperLink: 28, FastLink: 24, SpeedLink: 18, MicroLink: 12, EtherLink: 16 }, relation: "<=", rhs: 100000 },
        { name: "Memory chips", terms: { HyperLink: 8, FastLink: 8, SpeedLink: 4, MicroLink: 4, EtherLink: 6 }, relation: "<=", rhs: 30000 },
        { name: "Assembly hours", terms: { HyperLink: 0.75, FastLink: 0.6, SpeedLink: 0.5, MicroLink: 0.65, EtherLink: 1 }, relation: "<=", rhs: 5000 },
        { name: "FastLink ≥ 2 × HyperLink", terms: { FastLink: 1, HyperLink: -2 }, relation: ">=", rhs: 0, note: "FastLink ≥ 2 × HyperLink" },
      ],
      notes: "Profit per unit = wholesale price − manufacturing cost: 53, 48, 33, 32, 38.",
    },
    expected: { source: "Python (SciPy / HiGHS)", objective: 215000, values: { HyperLink: 500, FastLink: 1000, SpeedLink: 1500, MicroLink: 2250, EtherLink: 500 } },
  },
  {
    id: "lab-p7",
    label: "P7 · Weedwacker make-or-buy",
    group: "practice",
    problem:
      "Supply 30,000 electric and 15,000 gas trimmers at least cost. Making costs $55 / $85; buying costs $67 / $95. In-house hours are limited in production (10,000), assembly (15,000) and packaging (5,000).",
    model: {
      title: "Weedwacker make-or-buy",
      direction: "min",
      objectiveName: "Total cost ($)",
      nonNegative: true,
      variables: [
        { name: "MakeElectric", label: "Electric made", objective: 55, min: 0, max: null, integer: false },
        { name: "MakeGas", label: "Gas made", objective: 85, min: 0, max: null, integer: false },
        { name: "BuyElectric", label: "Electric bought", objective: 67, min: 0, max: null, integer: false },
        { name: "BuyGas", label: "Gas bought", objective: 95, min: 0, max: null, integer: false },
      ],
      constraints: [
        { name: "Electric contract", terms: { MakeElectric: 1, BuyElectric: 1 }, relation: "=", rhs: 30000 },
        { name: "Gas contract", terms: { MakeGas: 1, BuyGas: 1 }, relation: "=", rhs: 15000 },
        { name: "Production hours", terms: { MakeElectric: 0.2, MakeGas: 0.4 }, relation: "<=", rhs: 10000 },
        { name: "Assembly hours", terms: { MakeElectric: 0.3, MakeGas: 0.5 }, relation: "<=", rhs: 15000 },
        { name: "Packaging hours", terms: { MakeElectric: 0.1, MakeGas: 0.1 }, relation: "<=", rhs: 5000 },
      ],
    },
    expected: { source: "Python (SciPy / HiGHS)", objective: 2975000, values: { MakeElectric: 30000, MakeGas: 10000, BuyElectric: 0, BuyGas: 5000 } },
  },
  {
    id: "lab-p9",
    label: "P9 · Concert ticket mix",
    group: "practice",
    problem:
      "Sell premium ($500, 8 sq ft), standard ($250, 6 sq ft) and standing ($100, 3 sq ft) tickets in 100,000 sq ft. At most 20,000 tickets, at most 8,000 premium + standard, and at least 3 standard per premium. Maximize revenue. Part (c): the shadow price of the 20,000 capacity × 400 tickets is what extra safety measures are worth.",
    model: {
      title: "Swift & Kelce concert",
      direction: "max",
      objectiveName: "Ticket revenue ($)",
      nonNegative: true,
      variables: [
        { name: "Premium", label: "Premium tickets", objective: 500, min: 0, max: null, integer: false },
        { name: "Standard", label: "Standard tickets", objective: 250, min: 0, max: null, integer: false },
        { name: "Standing", label: "Standing room tickets", objective: 100, min: 0, max: null, integer: false },
      ],
      constraints: [
        { name: "Floor space (sq ft)", terms: { Premium: 8, Standard: 6, Standing: 3 }, relation: "<=", rhs: 100000 },
        { name: "Fire code capacity", terms: { Premium: 1, Standard: 1, Standing: 1 }, relation: "<=", rhs: 20000 },
        { name: "Premium + standard limit", terms: { Premium: 1, Standard: 1 }, relation: "<=", rhs: 8000 },
        { name: "≥ 3 standard per premium", terms: { Standard: 1, Premium: -3 }, relation: ">=", rhs: 0, note: "Standard ≥ 3 × Premium" },
      ],
    },
    expected: { source: "Python (SciPy / HiGHS)", objective: 3700000, values: { Premium: 2000, Standard: 6000, Standing: 12000 } },
  },

  // ------------------------------------------------------------------ Business templates
  {
    id: "mix",
    label: "Product mix (maximize profit)",
    group: "business",
    model: {
      title: "Product mix",
      direction: "max",
      objectiveName: "Monthly contribution profit ($)",
      variables: [
        { name: "trail_pack", label: "Trail backpack", objective: 38, min: 0, max: 1800, integer: true },
        { name: "rain_shell", label: "Rain shell jacket", objective: 52, min: 200, max: 1200, integer: true },
        { name: "camp_stove", label: "Camp stove", objective: 27, min: 0, max: 2500, integer: true },
      ],
      constraints: [
        { name: "Sewing hours", terms: { trail_pack: 0.8, rain_shell: 1.2, camp_stove: 0 }, relation: "<=", rhs: 2400 },
        { name: "Assembly hours", terms: { trail_pack: 0.4, rain_shell: 0.3, camp_stove: 0.9 }, relation: "<=", rhs: 2100 },
        { name: "Warehouse space (m³)", terms: { trail_pack: 0.05, rain_shell: 0.02, camp_stove: 0.04 }, relation: "<=", rhs: 150 },
      ],
    },
  },
  {
    id: "marketing",
    label: "Marketing budget allocation",
    group: "business",
    model: {
      title: "Marketing budget allocation",
      direction: "max",
      objectiveName: "Expected gross profit from campaigns ($)",
      variables: [
        { name: "search", label: "Paid search ($)", objective: 1.9, min: 5000, max: 40000, integer: false },
        { name: "social", label: "Paid social ($)", objective: 1.6, min: 5000, max: 35000, integer: false },
        { name: "email", label: "Email & CRM ($)", objective: 3.1, min: 1000, max: 8000, integer: false },
        { name: "events", label: "Trade events ($)", objective: 1.3, min: 0, max: 30000, integer: false },
      ],
      constraints: [
        { name: "Total budget", terms: { search: 1, social: 1, email: 1, events: 1 }, relation: "<=", rhs: 75000 },
        { name: "Brand channels ≥ 30% of budget", terms: { search: -0.3, social: 0.7, email: -0.3, events: 0.7 }, relation: ">=", rhs: 0, note: "Social + Events ≥ 30% of total budget" },
      ],
    },
  },
  {
    id: "staffing",
    label: "Staffing plan (minimize cost)",
    group: "business",
    model: {
      title: "Staffing plan",
      direction: "min",
      objectiveName: "Monthly labour cost ($)",
      variables: [
        { name: "full_time", label: "Full-time staff", objective: 6200, min: 10, max: null, integer: true },
        { name: "part_time", label: "Part-time staff", objective: 2700, min: 0, max: 25, integer: true },
        { name: "contractors", label: "Contractors", objective: 7400, min: 0, max: 10, integer: true },
      ],
      constraints: [
        { name: "Hours of work required", terms: { full_time: 160, part_time: 80, contractors: 150 }, relation: ">=", rhs: 5600 },
        { name: "Supervisor ratio (FT ≥ 40% of team)", terms: { full_time: 0.6, part_time: -0.4, contractors: -0.4 }, relation: ">=", rhs: 0, note: "Full-time ≥ 40% of all staff" },
        { name: "Weekend coverage (PT + contractors)", terms: { part_time: 1, contractors: 1 }, relation: ">=", rhs: 8 },
      ],
    },
  },
];
