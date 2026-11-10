import type Anthropic from "@anthropic-ai/sdk";
import { askJson, errorResponse } from "@/lib/ai.server";
import { EXTRACT_SCHEMA } from "@/lib/schemas";

export const maxDuration = 300;

export interface ExtractResult {
  company: string;
  granularity: "month" | "quarter" | "year";
  periods: string[];
  lines: { name: string; category: string; group: string; values: number[] }[];
  notes: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { filename: string; mediaType?: string; data?: string; text?: string };
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (body.data && body.mediaType === "application/pdf") {
      if (body.data.length * 0.75 > MAX_BYTES) return Response.json({ error: "PDF is larger than 20 MB." }, { status: 413 });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.data } });
    } else if (body.data && /^image\/(png|jpeg|gif|webp)$/.test(body.mediaType ?? "")) {
      content.push({ type: "image", source: { type: "base64", media_type: body.mediaType as "image/png", data: body.data } });
    } else if (body.text) {
      content.push({ type: "text", text: `<document name="${body.filename.replace(/"/g, "")}">\n${body.text.slice(0, 400000)}\n</document>` });
    } else {
      return Response.json({ error: "No file content received." }, { status: 400 });
    }
    content.push({
      type: "text",
      text: `File name: ${body.filename}\nExtract every income-statement line item (revenue, other income, cost of sales, operating expenses, interest, tax) for every period column. Classify each line: revenue = core sales; other_income = interest/dividends/rental/grants/gains; cogs = direct costs of goods/services; opex_variable = costs that scale with sales volume (commissions, shipping, payment fees, marketing, usage-based costs, contractors); opex_fixed = costs that don't scale with volume in the short run (salaries, rent, insurance, depreciation, software, professional fees); non_operating = interest expense and one-off losses; tax = income tax; ignore = subtotals and totals (Total revenue, Gross profit, Net income...). Report cost values as positive numbers and sales returns/discounts as negative revenue. If the document is not a financial statement, return empty lines and explain in notes.`,
    });
    const result = await askJson<ExtractResult>({
      system: "You are a meticulous financial analyst who extracts structured data from company financial statements. Never invent numbers. If a value is unreadable, use 0 and mention it in notes.",
      content,
      schema: EXTRACT_SCHEMA,
      effort: "medium",
      maxTokens: 64000,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
