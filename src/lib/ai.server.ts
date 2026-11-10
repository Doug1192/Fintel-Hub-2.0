import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.FINTEL_MODEL || process.env.FIN_ZEUS_MODEL || "claude-opus-5-5";

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export class AiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/**
 * Ask Claude for a JSON object matching `schema`. Uses structured outputs so the
 * response is guaranteed to parse, and server-side fallbacks so a safety decline
 * is retried on a fallback model instead of failing outright.
 */
export async function askJson<T>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  if (!aiConfigured()) throw new AiError("AI is not configured. Set ANTHROPIC_API_KEY on the server.", 503);
  try {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: {
        effort: opts.effort ?? "medium",
        format: { type: "json_schema", schema: opts.schema },
      },
      messages: [{ role: "user", content: opts.content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new AiError("The AI declined this request.", 422);
    if (msg.stop_reason === "max_tokens") throw new AiError("The AI response was cut off. Try a shorter input.", 502);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return JSON.parse(text) as T;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The configured Anthropic API key is invalid.", 401);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI is rate limited. Try again in a minute.", 429);
    if (e instanceof Anthropic.BadRequestError) throw new AiError("The AI rejected the request: " + e.message, 400);
    if (e instanceof Anthropic.APIError) throw new AiError(`AI service error (${e.status ?? "network"}).`, 502);
    if (e instanceof SyntaxError) throw new AiError("The AI returned an unreadable response.", 502);
    throw e;
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof AiError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Unknown error";
  return Response.json({ error: message }, { status });
}
