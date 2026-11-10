import { askJson, errorResponse } from "@/lib/ai.server";
import { OPTIMIZE_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { description } = (await req.json()) as { description: string };
    if (!description?.trim()) return Response.json({ error: "Describe the decision you want to optimise." }, { status: 400 });
    const result = await askJson({
      system:
        "You turn plain-language business decisions into linear or integer programming models. Identify decision variables (with short identifiers, lower and upper bounds, and whether they must be whole numbers), a linear objective (max or min) and linear constraints. Use only numbers the user gives; where something is missing, make a clearly stated, reasonable assumption in notes. Keep variable identifiers consistent between variables and constraint terms.",
      content: description.slice(0, 8000),
      schema: OPTIMIZE_SCHEMA,
      effort: "medium",
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
