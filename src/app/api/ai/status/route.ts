import { aiConfigured, MODEL } from "@/lib/ai.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ configured: aiConfigured(), model: aiConfigured() ? MODEL : null });
}
