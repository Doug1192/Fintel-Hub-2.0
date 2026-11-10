import { askJson, errorResponse } from "@/lib/ai.server";
import { INSIGHTS_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await askJson({
      system:
        "You are a senior FP&A advisor writing for a business owner. You get a company's KPI summary, period-by-period P&L and cost breakdown. Give a crisp verdict, 4-6 specific insights backed by the numbers (cite figures), and 3-5 prioritised actions with estimated impact. No generic advice, and don't restate every number.",
      content: `<financials>\n${JSON.stringify(payload).slice(0, 100000)}\n</financials>`,
      schema: INSIGHTS_SCHEMA,
      effort: "medium",
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
