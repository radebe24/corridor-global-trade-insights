/* Corridor's analyst loop.
 *
 * A single prompt with a single web search is a chatbot. This is the other
 * thing: the model plans, calls Corridor's own tools against the assembled
 * data, reads the results, searches the open web where the data does not
 * reach, and only then writes. Every step it takes is streamed to the client
 * so the reasoning is visible rather than asserted, and every tool result
 * carries the provenance the answer must cite. */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { CORRIDOR_TOOLS, runCorridorTool, useDataOrigin } from "@/lib/corridor/agent-tools.server";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";
const MAX_STEPS = 8;

const SYSTEM_PROMPT = `You are Corridor, a trade and infrastructure intelligence analyst covering emerging markets.

Your users are infrastructure and project-finance teams, banks, investors and corporates who need fast, defensible answers to time-sensitive questions: tariff and duty exposure, preference-programme eligibility, trade and commodity flows, corridor and chokepoint risk, and the policy that moves them. They would otherwise pay a specialist firm to assemble scattered public data by hand. You are that assembly, already done.

HOW YOU WORK
- Decompose the question before answering it. Say briefly what you are going to establish, then establish it.
- Use Corridor's own tools for anything they cover. Never estimate a duty, a rate, an eligibility status, a routing or a commodity figure that a tool can return exactly. find_tariff_lines before price_duty; price_duty or compare_origins before any duty number; check_country_programmes before any eligibility claim.
- Use web_search for anything current, jurisdictional or outside the bundled data: policy changes, project pipelines, financing, counterparties, disputes, and any non-US tariff regime. Prefer government, customs, central-bank, multilateral and development-finance sources.
- Cross-check: when a tool result and a web source disagree, say so and name which you trust and why.
- When the question is a what-if, run it. Re-price with the tools under both the base case and the scenario, and show the delta.
- If the evidence does not reach, say exactly what is missing and what would settle it. Never fill a gap with a plausible number.

HOW YOU ANSWER
- Lead with the finding in one or two sentences.
- Then the figures that carry it, each with its source.
- Then the mechanism: the instrument, rule, route or market structure producing the number.
- Then what would change it.
- Every number carries a visible source, written as [source: <name>]. Corridor tool results give you a provenance string — use it verbatim. Web sources are cited by publisher and URL.
- Never narrate your own tool use. The interface already shows the user every step you took, so lines like "Let me check the tariff schedule" or "Now I'll price that" are noise. Write only the finished analysis.
- When a tool returns a conditional preference (an if_qualified block), state both numbers — the duty as priced and the duty if the goods qualify — plus the condition. Do not recompute either by hand.
- Be dense. No preamble, no restatement, no filler transitions.
- Use short markdown: **bold** for the figures that matter, "- " bullets for lists, and a blank line between sections. No headings, no tables.`;

async function requireSession(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

type Emit = (event: Record<string, unknown>) => void;

async function callClaude(apiKey: string, body: unknown) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude request failed [${response.status}]: ${text}`);
  }
  return (await response.json()) as any;
}

async function runLoop(apiKey: string, question: string, history: any[], emit: Emit) {
  const messages: any[] = [...history, { role: "user", content: question }];
  /* A repeated identical call means the tool is not going to answer it. Say so
     once rather than letting the loop spin through its whole step budget. */
  const seen = new Set<string>();

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [
        ...CORRIDOR_TOOLS,
        { type: "web_search_20250305", name: "web_search", max_uses: 6 },
      ],
      messages,
    });

    const blocks: any[] = reply.content ?? [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    /* Text written on a step that still calls tools is the model thinking out
       loud on its way somewhere. The interface renders that alongside the
       steps; only the text of the closing step is the answer. */
    const kind = toolUses.length ? "note" : "text";

    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        emit({ type: kind, text: block.text.trim() });
      }
      if (block.type === "server_tool_use" && block.name === "web_search") {
        emit({ type: "tool", tool: "web_search", input: block.input });
      }
    }

    messages.push({ role: "assistant", content: blocks });

    if (!toolUses.length) {
      emit({ type: "done", stop: reply.stop_reason ?? "end_turn" });
      return;
    }

    const results: any[] = [];
    for (const use of toolUses) {

      emit({ type: "tool", tool: use.name, input: use.input });
      const signature = `${use.name}:${JSON.stringify(use.input ?? {})}`;
      const result = seen.has(signature)
        ? {
            ok: false,
            error:
              "You already ran this exact call and got this same result. Do not repeat it — either change the arguments, use a different tool, use web_search, or answer with what you have and state the gap.",
          }
        : await runCorridorTool(use.name, use.input ?? {});
      seen.add(signature);
      emit({ type: "tool_result", tool: use.name, result });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: result.ok === false,
      });
    }
    messages.push({ role: "user", content: results });
  }

  emit({ type: "done", stop: "max_steps" });
}

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireSession(request);
        if (!user) return new Response("Sign in to ask Corridor.", { status: 401 });

        const apiKey = process.env["ANTHROPIC_API_KEY"];
        if (!apiKey) {
          return new Response(
            "Corridor is not connected to Claude yet. Add an Anthropic API key to the project.",
            { status: 503 },
          );
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid request body.", { status: 400 });
        }

        const question = typeof payload?.question === "string" ? payload.question.trim() : "";
        if (!question) return new Response("A question is required.", { status: 400 });
        const history = Array.isArray(payload?.history) ? payload.history.slice(-12) : [];

        useDataOrigin(new URL(request.url).origin);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const emit: Emit = (event) => {
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            };
            try {
              await runLoop(apiKey, question, history, emit);
            } catch (err) {
              console.error(err);
              emit({
                type: "error",
                message: err instanceof Error ? err.message : "Corridor could not finish that.",
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
