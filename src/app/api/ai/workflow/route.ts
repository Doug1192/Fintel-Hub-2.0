import { askJson, errorResponse } from "@/lib/ai.server";
import { WORKFLOW_SCHEMA } from "@/lib/schemas";
import type { WorkflowAnalysis } from "@/lib/workflow";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { text, hoursPerWeek = 40, context = "" } = (await req.json()) as { text: string; hoursPerWeek?: number; context?: string };
    if (!text || text.trim().length < 20) return Response.json({ error: "Please provide a job description or process (at least a few sentences)." }, { status: 400 });
    const result = await askJson<Omit<WorkflowAnalysis, "source">>({
      system:
        "You are an operations-efficiency and AI-adoption consultant. Given a job description or an end-to-end process, break it into its distinct tasks and assess each one: how much AI or automation could take on (0-100), whether to automate, augment (AI assists a person), eliminate (the step is waste), or keep_human, and give a specific, practical recommendation with example tool types. Be realistic: judgement, relationships and physical work score low. Estimate weekly hours saved from the stated weekly hours. Add process-level efficiency improvements that aren't about AI (batching, handoffs, standardisation), a phased roadmap, and the key risks. Write plainly for a business owner.",
      content: `Weekly hours for this role/process: ${hoursPerWeek}\n${context ? `Business context: ${context}\n` : ""}\n<input>\n${text.slice(0, 20000)}\n</input>`,
      schema: WORKFLOW_SCHEMA,
      effort: "medium",
    });
    return Response.json({ ...result, source: "ai" } satisfies WorkflowAnalysis);
  } catch (e) {
    return errorResponse(e);
  }
}
