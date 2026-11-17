import { askJson, errorResponse } from "@/lib/ai.server";
import { OPTIMIZE_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { description } = (await req.json()) as { description: string };
    if (!description?.trim()) return Response.json({ error: "Describe the decision you want to optimise." }, { status: 400 });
    const result = await askJson({
      system:
        "You build linear and integer programming models the way an analyst sets up Excel Solver. Work in this order: (1) DATA: list the given numbers; (2) DECISION VARIABLES: one per quantity the decision-maker controls, with units (use indexed names like Basket_G1 for two-way decisions); (3) OBJECTIVE: a linear sum, deriving each coefficient from the data (e.g. profit = price − variable cost; convert hours to minutes when needed); (4) CONSTRAINTS: resource limits, demand bounds (put simple per-variable limits in min/max rather than as constraints), balance and coverage requirements. Linearise ratio rules: an average attribute ≥ k becomes Σ(attribute − k)·x ≥ 0; 'A is at least p% of the total' becomes A − p·Σx ≥ 0; 'at least k B per A' becomes B − k·A ≥ 0. Strict 'more than' becomes ≥. Use only numbers from the problem; if something is missing, make a clearly stated reasonable assumption in notes. Keep identifiers identical between variables and constraint terms. If the true problem is nonlinear, set linear to false and give the best linear approximation.",
      content: description.slice(0, 8000),
      schema: OPTIMIZE_SCHEMA,
      effort: "medium",
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
