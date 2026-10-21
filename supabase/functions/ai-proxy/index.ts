// Server-side proxy for Tabby's AI features (categorization, natural-
// language expense parsing, monthly insight summaries).
//
// This exists specifically to fix a known limitation flagged early in
// development: calling Gemini directly from the app meant the API key
// shipped inside the app bundle, extractable by anyone who decompiled it.
// Routing through here means GEMINI_API_KEY only ever lives as a server
// secret (set via `supabase secrets set`), never in client code.
//
// auth: 'user' requires a real logged-in user's JWT -- not just the
// publishable key baked into every app install, which proves nothing
// about who's calling. Matches the "authenticated role only" posture
// used by every RLS policy elsewhere in this project.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// 'latest' alias rather than a pinned version -- see src/lib/ai.ts history
// for why: the pinned gemini-3.8-flash model hit sustained 503s under
// demand, this alias stays pointed at whichever lite model is healthy.
const GEMINI_MODEL = "gemini-flash-lite-latest";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A plain string for text-only prompts, or an array of content parts for
// multimodal input (receipt/statement scanning) -- a text part plus an
// image or document part with inline base64 data, per Gemini's Interactions
// API (type: 'text' | 'image' | 'document', each image/document part
// carrying `data` + `mime_type`).
type GeminiInput = string | Record<string, unknown>[];

async function callGeminiOnce(input: GeminiInput, schema: Record<string, unknown>): Promise<unknown> {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY secret.");
  }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const outputStep = data.steps?.find((s: { type: string }) => s.type === "model_output");
  const text = outputStep?.content?.[0]?.text;
  if (!text) throw new Error("Gemini returned no output.");

  return JSON.parse(text);
}

// One retry on transient 5xx -- observed gemini-3.8-flash doing this under
// demand spikes during development; cheap insurance against the same
// happening to whichever model the 'latest' alias currently points at.
async function callGemini(input: GeminiInput, schema: Record<string, unknown>): Promise<unknown> {
  try {
    return await callGeminiOnce(input, schema);
  } catch (err) {
    const isServerError = err instanceof Error && /Gemini API error: 5\d\d/.test(err.message);
    if (!isServerError) throw err;
    await sleep(800);
    return await callGeminiOnce(input, schema);
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const { input, schema } = await req.json();
      const validInput = typeof input === "string" ? input.length > 0 : Array.isArray(input) && input.length > 0;
      if (!validInput || !schema) {
        return Response.json({ error: "Missing or invalid input/schema." }, { status: 400 });
      }

      // 40 calls/hour/user -- generous for normal use (a few receipt
      // scans and quick-adds a day), but bounded so one runaway client
      // can't burn through the shared GEMINI_API_KEY budget for everyone.
      //
      // Run this alongside the Gemini call rather than gating it first --
      // the RPC almost always allows the request, so blocking on it
      // serially cost every normal call a full extra network round trip
      // for a check that rarely says no. Only on the rare "actually over
      // the cap" case is the Gemini call's result wasted.
      const [rateLimitResult, geminiResult] = await Promise.allSettled([
        ctx.supabaseAdmin.rpc("check_ai_proxy_rate_limit", { p_user_id: ctx.userClaims!.id }),
        callGemini(input, schema),
      ]);

      if (rateLimitResult.status === "rejected") throw rateLimitResult.reason;
      const { data: allowed, error: rateLimitError } = rateLimitResult.value;
      if (rateLimitError) throw rateLimitError;
      if (!allowed) {
        return Response.json({ error: "Too many AI requests. Try again in a bit." }, { status: 429 });
      }

      if (geminiResult.status === "rejected") throw geminiResult.reason;
      return Response.json({ result: geminiResult.value });
    } catch (err) {
      // Log the real error server-side only -- it can carry internal detail
      // (Gemini response shape, RPC/Postgres errors) that shouldn't reach
      // the client.
      console.error("ai-proxy error:", err);
      return Response.json({ error: "AI request failed. Try again in a bit." }, { status: 500 });
    }
  }),
};
