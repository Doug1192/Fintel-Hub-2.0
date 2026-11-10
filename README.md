# Fintel-Hub 2.0 — Financial Intelligence Hub

An interactive web app that turns company statements into decisions. Upload your P&L or ledger
exports and the Fintel Hub categorizes every line, builds a KPI dashboard, forecasts, runs sensitivity
and goal-seek analysis, optimizes decisions under constraints, tests pricing strategies, tells you
which documents you need for any analysis, and finds where AI can make roles and processes more efficient.

## Modules

| Module | What it does |
|---|---|
| **Statements & Data** | Upload CSV, Excel, PDF or text (wide, long/ledger, or single-period). Auto-classifies lines as revenue, other income, COGS, **variable** or **fixed** opex, interest or tax, and skips subtotals. Reclassify inline. |
| **Dashboard** | KPIs (growth, gross / contribution / operating / net margin, break-even, margin of safety, operating leverage), trends, cost and income breakdowns, a condensed P&L, a quick forecast, and rule-based insights (plus an AI deep-dive). |
| **Forecast** | Monthly, quarterly or yearly timeline with a choice of horizon. Auto-selects Holt-Winters, damped Holt, linear or CAGR, shows 80% prediction ranges, and adjusts for growth, inflation, cost ratio and tax. CSV export. |
| **Sensitivity & Goal Seek** | What-if sliders (price, volume, unit cost, fixed cost, productivity, headcount, elasticity), a profit bridge, a tornado chart, and a price × volume data table. **Reverse goal seek**: set a target profit, revenue or margin and get the move each lever needs (volume, price, cost, workforce, balanced mix). |
| **Optimizer** | A linear and integer programming builder: decision variables, constraints and objective. Templates (product mix, marketing budget, staffing), binding constraints, slack and shadow prices. Can build a model from a plain-English description using AI. |
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
- `npm run selftest` runs the engine tests (classifier, parser, forecast, goal seek, optimizer, pricing, workflow)

## Tech

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Recharts · Zustand (data is saved in the browser) ·
javascript-lp-solver · SheetJS · pdf.js · Anthropic SDK (structured outputs, server-side only).

## Privacy

Statement data stays in the user's browser (localStorage). It is only sent to the server, and from there to
Anthropic, when an AI feature is used and an API key is configured.

## Project layout

```
src/app/            pages (dashboard, data, forecast, scenarios, optimize, pricing, documents, workflow) + api/ai/*
src/lib/            engines: classify, parse, finance, forecast, scenario, optimize, pricing, documents, workflow
src/components/     app shell, UI kit, chart helpers
scripts/selftest.ts engine tests
```
