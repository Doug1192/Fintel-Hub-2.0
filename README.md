# Fintel Hub 2.0 — Financial Intelligence Hub

An interactive web app that turns company statements into decisions. Upload your P&L or ledger
exports and Fintel Hub categorizes every line, builds a KPI dashboard, forecasts, runs sensitivity
and goal-seek analysis, optimizes decisions under constraints, tests pricing strategies, tells you
which documents you need for any analysis, and finds where AI can make roles and processes more efficient.

## Modules

| Module | What it does |
|---|---|
| **Aliases & Vault** | Each analysis or check lives in its own **alias** (workspace) with its own documents, data, saved optimizer model and chosen features (full analysis, optimization only, pricing review, forecast & planning, or custom), so uploads never mix. Every upload is kept in the **vault**; unassigned documents wait in the **General Vault** until you add them to one or more aliases. |
| **Document → Optimizer** | Upload a data table (products, capacities, costs) and click **Optimize with this**: Fintel guesses each column's role (name, profit or price/cost, min, max, resource use) and reads limits from an "Available"/"Capacity" row; you confirm or adjust, then generate and solve. Also available from the vault and the Optimizer's document list; Claude can draft models for other layouts when an API key is set. |
| **Statements & Data** | Upload CSV, Excel, PDF or text (wide, long/ledger, or single-period). Auto-classifies lines as revenue, other income, COGS, **variable** or **fixed** opex, interest or tax, and skips subtotals. Reclassify inline. |
| **Dashboard** | KPIs (growth, gross / contribution / operating / net margin, break-even, margin of safety, operating leverage), trends, cost and income breakdowns, a condensed P&L, a quick forecast, and rule-based insights (plus an AI deep-dive). |
| **Forecast** | Monthly, quarterly or yearly timeline with a choice of horizon. Auto-selects Holt-Winters, damped Holt, linear or CAGR, shows 80% prediction ranges, and adjusts for growth, inflation, cost ratio and tax. CSV export. |
| **Sensitivity & Goal Seek** | What-if sliders (price, volume, unit cost, fixed cost, productivity, headcount, elasticity), a profit bridge, a tornado chart, and a price × volume data table. **Reverse goal seek**: set a target profit, revenue or margin and get the move each lever needs (volume, price, cost, workforce, balanced mix). |
| **Optimizer** | Excel Solver-style LP / integer programming: Max, Min or **Value Of** objective, changing variables with bounds and types (continuous, integer, binary), constraints, and "make unconstrained variables non-negative". Helpers turn weighted averages, shares and ratios into linear constraints. **Answer report**, **Sensitivity report** (shadow prices, reduced costs, allowable ranges), the written **LP formulation**, and exports to an **Excel workbook with Solver pre-configured**, **Python (PuLP or SciPy)** and **LP files**. Templates include the Module 1 lab (with Excel Solver answers) and Module 3 lab problems; any template or template group can be removed from the gallery and restored later. A **pattern builder** generates larger models from small tables, as loops would in PuLP: *inventory over time* (production, trading, storage), *sources × uses* (blending, grading, shipping with weighted-average quality rules) and *coverage* (leases, shifts) and *network over time* (multi-stage supply chains with production, storage and fixed only-if-used route costs); the Module 4 lab problems are built this way. A **fixed-cost helper** adds the yes/no variable and linking constraint for any cost paid only when something is used, with a big-M computed from the model. Objectives can include a fixed **constant** (e.g. holding cost on starting stock). Solutions are refined to exact vertex values, and sensitivity ranges use the simplex ratio tests. Linear and integer models only (no GRG Nonlinear yet). |
| **Pricing Lab** | Simulates pricing strategies (premium, penetration, value-based, discount, custom) with elasticity, churn and CAC. Compares on NPV, LTV:CAC and payback, and runs a health check of whether pricing pays off long term. |
| **Document Advisor** | For 13 analyses (loan application, valuation, pricing review, audit…), the exact documents needed, the periods to cover, why each matters and where to get it. Tracks which ones you've uploaded. AI handles custom requests. |
| **AI Workflow Analyzer** | Paste a job description or end-to-end process to get task-level automation scores, automate / augment / eliminate / keep-human recommendations, hours freed, an efficiency roadmap and risks. |

The app works fully offline with built-in engines. Setting `ANTHROPIC_API_KEY` on the server
turns on the AI features (statement extraction from PDFs and images, AI insights, workflow analysis,
document checklists, and the natural-language optimizer).

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

A demo company is preloaded. Use **Statements & Data → CSV template** to see the expected upload format.

### Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm run lint`, `npm run typecheck`
- `npm run selftest` runs the engine tests (classifier, parser, forecast, goal seek, optimizer, pricing, workflow, aliases & vault). The optimizer is checked against the Excel Solver answers for the lab problems and against 160 random LP/MILP cases solved by SciPy (HiGHS).
- 30 random fixed-cost networks from the network builder are checked against SciPy's MILP solver (`npx tsx scripts/make_network_fixtures.ts | python scripts/crosscheck.py --pairs > scripts/fixtures/network-crosscheck.json`).
- Sensitivity reports are checked against HiGHS on 80 random non-degenerate LPs (`python scripts/make_sensitivity_fixtures.py`, needs `pip install highspy numpy`).
- `python scripts/make_lp_fixtures.py` regenerates the SciPy reference cases (`pip install scipy`); `scripts/crosscheck.py` solves any exported model list with SciPy.

## Tech

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Recharts · Zustand (data is saved in the browser) ·
javascript-lp-solver · SheetJS · pdf.js · Anthropic SDK (structured outputs, server-side only).

## Privacy

Statement data stays in the user's browser (localStorage). It is only sent to the server, and from there to
Anthropic, when an AI feature is used and an API key is configured.

## Project layout

```
src/app/            pages (dashboard, vault, data, forecast, scenarios, optimize, pricing, documents, workflow) + api/ai/*
src/lib/            engines: aliases, classify, parse, finance, forecast, scenario, optimize, pricing, documents, workflow
src/components/     app shell, UI kit, chart helpers
scripts/selftest.ts engine tests
```
