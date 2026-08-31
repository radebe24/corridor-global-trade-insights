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
import { DATA_REACH, SOURCE_TIERS, WRITING_STYLE } from "@/lib/corridor/prompt";
import { MODEL } from "@/lib/corridor/model";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const MAX_STEPS = 8;

const SYSTEM_PROMPT = `You are Corridor, a trade and infrastructure intelligence analyst working globally.

Your users are infrastructure and project-finance teams, banks, investors and corporates who need fast, defensible answers to time-sensitive questions: tariff and duty exposure, preference-programme eligibility, trade and commodity flows, corridor and chokepoint risk, and the policy that moves them. They would otherwise pay a specialist firm to assemble scattered public data by hand. You are that assembly, already done.

You cover any origin and any corridor. Your bundled data goes deepest on US import exposure and on the emerging-market corridors that feed it, and that depth is a strength to use rather than a boundary to stay inside.

${DATA_REACH}

HOW YOU WORK
- Decompose the question before answering it. Say briefly what you are going to establish, then establish it.
- Use Corridor's own tools for anything they cover. Never estimate a duty, a rate, an eligibility status, a routing, a chokepoint figure or a commodity figure that a tool can return exactly. find_tariff_lines before price_duty; price_duty or compare_origins before any duty number; check_country_programmes before any eligibility claim; trace_lane before describing a routing; chokepoint_profile before characterising a strait or canal; infrastructure_coverage before saying what infrastructure data exists.
- Use web_search for anything current, jurisdictional or outside the bundled data: policy changes, project pipelines, financing, counterparties, disputes, live chokepoint status, and every non-US tariff regime.
- Cross-check: when a tool result and a web source disagree, say so and name which you trust and why.
- When the question is a what-if, run it. Re-price or re-trace with the tools under both the base case and the scenario, and show the delta. A Red Sea closure is trace_lane twice, once with via_cape.
- If the evidence does not reach, say exactly what is missing and what would settle it. Never fill a gap with a plausible number.

${SOURCE_TIERS}

HOW YOU ANSWER
- Lead with the finding in one or two sentences.
- Then the figures that carry it, each with its source.
- Then the mechanism: the instrument, rule, route or market structure producing the number.
- Then what would change it.
- Every number carries a visible source, written as [source: <name>]. Corridor tool results give you a provenance string, use it verbatim. Web sources are cited by publisher and URL, with the tier.
- Never narrate your own tool use. The interface already shows the user every step you took, so lines like "Let me check the tariff schedule" or "Now I'll price that" are noise. Write only the finished analysis.
- When a tool returns a conditional preference (an if_qualified block), state both numbers, the duty as priced and the duty if the goods qualify, plus the condition. Do not recompute either by hand.
- When a tool result carries a constraint on its own use, that constraint binds you. The geodatabase register is the case that matters: say what it covers and cite its DOI, never quote a figure from it.
- No preamble, no restatement, no filler transitions.
- Use short markdown: **bold** for the figures that matter, "- " bullets for lists, and a blank line between sections. No headings, no tables.

${WRITING_STYLE}`;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Overload and upstream wobble are transient and routine on long tool loops.
   Failing the whole run on the first 529 threw away every step already paid
   for, so retry the call itself with backoff and only surface a terminal
   status (bad request, bad key, no credit) to the reader. */
async function callClaude(apiKey: string, body: unknown, signal?: AbortSignal) {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(700 * 2 ** (attempt - 1) + Math.random() * 300);
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (response.ok) return (await response.json()) as any;

    const text = await response.text();
    lastError = `Claude request failed [${response.status}]: ${text}`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) throw new Error(lastError);
  }
  throw new Error(lastError);
}

/* The client replays the conversation, so it is untrusted shape. Keep only
   plain user and assistant text: tool blocks cannot be replayed without their
   ids and would fail the request. */
function cleanHistory(history: unknown): any[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m: any) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-12)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 12000) }));
}

/* Three questions the answer makes worth asking next. Cheap, no tools, and
   never allowed to fail the run. */
async function suggestFollowups(apiKey: string, question: string, answer: string, emit: Emit) {
  try {
    const reply = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 300,
      system:
        "Given a trade-intelligence question and its answer, propose the three questions a professional reader would ask next. Each must be specific, self-contained, and answerable with tariff, commodity, corridor or policy evidence. Reply with the three questions only, one per line, no numbering, no preamble.",
      messages: [{ role: "user", content: `Question: ${question}\n\nAnswer:\n${answer}` }],
    });
    const text = (reply.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const items = text
      .split("\n")
      .map((l: string) => l.replace(/^\s*[-*\d.)\s]+/, "").trim())
      .filter((l: string) => l.length > 15)
      .slice(0, 3);
    if (items.length) emit({ type: "followups", items });
  } catch {
    /* suggestions are a nicety, never a failure mode */
  }
}

async function runLoop(
  apiKey: string,
  question: string,
  history: any[],
  emit: Emit,
  signal?: AbortSignal,
) {
  const messages: any[] = [...history, { role: "user", content: question }];
  /* A repeated identical call means the tool is not going to answer it. Say so
     once rather than letting the loop spin through its whole step budget. */
  const seen = new Set<string>();
  let answer = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callClaude(
      apiKey,
      {
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: [
          ...CORRIDOR_TOOLS,
          { type: "web_search_20250305", name: "web_search", max_uses: 6 },
        ],
        messages,
      },
      signal,
    );


    const blocks: any[] = reply.content ?? [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    /* Text written on a step that still calls tools is the model thinking out
       loud on its way somewhere. The interface renders that alongside the
       steps; only the text of the closing step is the answer. */
    const kind = toolUses.length ? "note" : "text";

    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        emit({ type: kind, text: block.text.trim() });
        if (kind === "text") answer += (answer ? "\n\n" : "") + block.text.trim();
      }
      if (block.type === "server_tool_use" && block.name === "web_search") {
        emit({ type: "tool", tool: "web_search", input: block.input });
      }
    }

    messages.push({ role: "assistant", content: blocks });

    if (!toolUses.length) {
      emit({ type: "done", stop: reply.stop_reason ?? "end_turn" });
      if (answer) await suggestFollowups(apiKey, question, answer, emit);
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
