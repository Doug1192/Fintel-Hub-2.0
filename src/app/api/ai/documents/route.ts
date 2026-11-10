import { askJson, errorResponse } from "@/lib/ai.server";
import { DOCUMENTS_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { query, have = [] } = (await req.json()) as { query: string; have?: string[] };
    if (!query?.trim()) return Response.json({ error: "Describe the task or analysis." }, { status: 400 });
    const result = await askJson({
      system:
        "You advise businesses on exactly which documents to gather for a financial or operational task. List specific document names (e.g. 'Accounts receivable aging summary'), whether each is required or recommended, the time span and frequency, why it matters, and where to get it. Keep it to what is really needed: usually 4-9 documents.",
      content: `Task: ${query.slice(0, 4000)}\nDocuments already uploaded: ${have.join(", ") || "none"}`,
      schema: DOCUMENTS_SCHEMA,
      effort: "low",
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
