import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

const title = "Ask Corridor — trade and infrastructure intelligence";
const description =
  "Ask in plain language about tariffs, eligibility, trade and infrastructure flows, corridor exposure and what-if scenarios across emerging markets. Every number carries its source.";

export const Route = createFileRoute("/intel")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Intel,
});

type Step =
  | { kind: "tool"; tool: string; input: unknown; result?: unknown }
  | { kind: "note"; text: string };

type Turn = {
  question: string;
  steps: Step[];
  answer: string;
  error?: string;
  running: boolean;
};


const EXAMPLES = [
  "What duty would we pay importing cotton knit t-shirts from Kenya versus Vietnam on a $2m order, and does AGOA change it?",
  "If the Red Sea stays closed, how does the routing and exposure change for a shipment from Kenya to the US East Coast?",
  "Which US preference programmes is Bangladesh currently subject to, and what would losing them cost on apparel?",
  "What is the cobalt supply picture for the DRC, and which corridors carry it?",
];

function Intel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput("");

    const index = turns.length;
    setTurns((prev) => [...prev, { question, steps: [], answer: "", running: true }]);

    const update = (fn: (turn: Turn) => Turn) =>
      setTurns((prev) => prev.map((t, i) => (i === index ? fn(t) : t)));

    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        sessionData = { session: data.session };
      }
      const token = sessionData.session?.access_token;

      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok || !response.body) {
        const message = await response.text();
        update((t) => ({ ...t, running: false, error: message || "Corridor could not answer." }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "text") {
            update((t) => ({
              ...t,
              answer: t.answer ? `${t.answer}\n\n${event.text}` : event.text,
            }));
          } else if (event.type === "note") {
            update((t) => ({ ...t, steps: [...t.steps, { kind: "note", text: event.text }] }));
          } else if (event.type === "tool") {
            update((t) => ({
              ...t,
              steps: [...t.steps, { kind: "tool", tool: event.tool, input: event.input }],
            }));

          } else if (event.type === "tool_result") {
            update((t) => {
              const steps = [...t.steps];
              for (let i = steps.length - 1; i >= 0; i--) {
                const step = steps[i];
                if (step && step.kind === "tool" && step.tool === event.tool && !step.result) {
                  steps[i] = { ...step, result: event.result };
                  break;
                }
              }
              return { ...t, steps };
            });
          } else if (event.type === "error") {
            update((t) => ({ ...t, error: event.message }));
          }
        }
      }

      update((t) => ({ ...t, running: false }));
    } catch (err) {
      update((t) => ({
        ...t,
        running: false,
        error: err instanceof Error ? err.message : "Corridor could not answer.",
      }));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-inner">
          <Link className="nav-brand" to="/">
            <span>Corridor</span>
          </Link>
          <div className="nav-links">
            <Link className="nav-link" to="/">
              Workspace
            </Link>
            <Link className="nav-link" to="/request">
              Request an analysis
            </Link>
            <Link className="nav-link" to="/auth">
              Account
            </Link>
          </div>
        </div>
      </nav>

      <main className="hero">
        <div className="container" style={{ maxWidth: 860, padding: "48px 0 140px" }}>
          <div className="section-eyebrow">Ask Corridor</div>
          <h1 className="section-title" style={{ marginBottom: 12 }}>
            Trade and infrastructure intelligence, on demand.
          </h1>
          <p className="usecases-sub">
            Tariffs, eligibility, commodity and corridor exposure, and what-if scenarios across
            emerging markets. Corridor queries its own assembled data first, searches the open web
            where the data does not reach, and shows every step it took.
          </p>

          {turns.length === 0 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 28 }}>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="how-step"
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => void ask(example)}
                >
                  <div className="how-copy">{example}</div>
                </button>
              ))}
            </div>
          ) : null}

          <div ref={scroller} style={{ marginTop: 32, display: "grid", gap: 40 }}>
            {turns.map((turn, index) => (
              <TurnView key={index} turn={turn} />
            ))}
          </div>

          <form
            onSubmit={onSubmit}
            style={{
              position: "sticky",
              bottom: 0,
              background: "var(--color-surface)",
              paddingTop: 24,
              paddingBottom: 24,
              marginTop: 32,
              display: "flex",
              gap: 12,
            }}
          >
            <input
              className="api-key-input"
              style={{ flex: 1 }}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a duty, an eligibility, a corridor, or a what-if…"
            />
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Working…" : "Ask"}
              <span className="btn-arrow">→</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  find_tariff_lines: "Searching the US tariff schedule",
  price_duty: "Pricing the duty",
  compare_origins: "Comparing origins",
  check_country_programmes: "Checking preference programmes",
  lookup_commodity: "Reading the USGS commodity record",
  trace_lane: "Tracing the shipping lane",
  web_search: "Searching public sources",
};

/* The answer arrives as light markdown: bold figures, dash bullets, blank-line
   paragraphs, and [source: …] citations. Rendering it as a wall of preformatted
   text was the last thing making an analyst's output look like debug output. */
function AnswerBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());

  return (
    <div className="intel-answer">
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (bullets) {
          return (
            <ul key={index}>
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inline(block)}</p>;
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[source:[^\]]+\])/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\[source:/.test(part))
      return (
        <span key={i} className="intel-cite">
          {part.slice(1, -1)}
        </span>
      );
    return <span key={i}>{part}</span>;
  });
}

function TurnView({ turn }: { turn: Turn }) {
  const done = turn.steps.filter((s) => s.kind === "tool" && s.result).length;
  const total = turn.steps.filter((s) => s.kind === "tool").length;

  return (
    <article className="intel-turn">
      <div className="intel-question">{turn.question}</div>

      {turn.steps.length ? (
        <div className="intel-steps">
          <div className="section-eyebrow">
            What Corridor did{total ? ` — ${done}/${total} checks` : ""}
          </div>
          {turn.steps.map((step, index) =>
            step.kind === "note" ? (
              <div key={index} className="intel-note">
                {step.text}
              </div>
            ) : (
              <details key={index} className="intel-step">
                <summary>
                  <span className={`intel-dot${step.result ? " is-done" : ""}`} />
                  {TOOL_LABELS[step.tool] ?? step.tool}
                  {step.result ? "" : " …"}
                </summary>
                <pre>{JSON.stringify(step.result ?? step.input, null, 2).slice(0, 4000)}</pre>
              </details>
            ),
          )}
        </div>
      ) : null}

      {turn.answer ? (
        <AnswerBody text={turn.answer} />
      ) : turn.running ? (
        <div className="how-copy">Working through it…</div>
      ) : null}

      {turn.error ? <div className="intel-error">{turn.error}</div> : null}
    </article>
  );
}

  );
}
