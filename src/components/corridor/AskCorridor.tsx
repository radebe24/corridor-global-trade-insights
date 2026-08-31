import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { WhatMoved } from "./WhatMoved";

type Step =
  | { kind: "tool"; tool: string; input: unknown; result?: unknown }
  | { kind: "note"; text: string };

type Turn = {
  question: string;
  steps: Step[];
  answer: string;
  followups: string[];
  error?: string;
  running: boolean;
  stopped?: boolean;
  seconds?: number;
};

const EXAMPLES = [
  "What duty would we pay importing cotton knit t-shirts from Kenya versus Vietnam on a $2m order, and does AGOA change it?",
  "What moves through the Strait of Hormuz, and which of our corridors depend on it?",
  "Trace cotton knit t-shirts from Vietnam to Rotterdam, and show what a Red Sea closure does to the routing.",
  "What is the cobalt supply picture for the DRC, which corridors carry it, and what infrastructure data exists for them?",
];

export function AskCorridor() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  /* The conversation as Claude will see it on the next question. Only plain
     text turns: the tool blocks belong to the run that produced them. */
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput("");

    const index = turns.length;
    const started = Date.now();
    setTurns((prev) => [...prev, { question, steps: [], answer: "", followups: [], running: true }]);

    const update = (fn: (turn: Turn) => Turn) =>
      setTurns((prev) => prev.map((t, i) => (i === index ? fn(t) : t)));

    const controller = new AbortController();
    abort.current = controller;
    let answerText = "";

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
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question, history: history.current.slice(-12) }),
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
            answerText = answerText ? `${answerText}\n\n${event.text}` : event.text;
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
          } else if (event.type === "followups") {
            const items = Array.isArray(event.items) ? event.items.map(String) : [];
            update((t) => ({ ...t, followups: items }));
          } else if (event.type === "error") {
            update((t) => ({ ...t, error: event.message }));
          }
        }
      }

      if (answerText) {
        history.current = [
          ...history.current,
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: answerText },
        ].slice(-12);
      }


      update((t) => ({ ...t, running: false, seconds: Math.round((Date.now() - started) / 1000) }));
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      update((t) => ({
        ...t,
        running: false,
        stopped: aborted,
        seconds: Math.round((Date.now() - started) / 1000),
        ...(aborted
          ? {}
          : { error: err instanceof Error ? err.message : "Corridor could not answer." }),
      }));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  }

  function reset() {
    abort.current?.abort();
    history.current = [];
    setTurns([]);
    setInput("");
  }

  const last = turns[turns.length - 1];

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-inner">
          <Link className="nav-brand" to="/">
            <span>Corridor</span>
          </Link>
          <div className="nav-links">
            {turns.length ? (
              <button type="button" className="nav-link" onClick={reset}>
                New conversation
              </button>
            ) : null}
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
            Tariffs, eligibility, commodity and corridor exposure, and what-if scenarios, any origin
            and any corridor. Corridor queries its own assembled data first, searches the open web
            where the data does not reach, and shows every step it took. Ask a follow-up and it
            keeps the thread.
          </p>

          {/* What moved since the last visit, before the reader thinks of a
              question. Renders nothing at all when nothing has moved. */}
          {turns.length === 0 ? <WhatMoved /> : null}

          {turns.length === 0 ? (
            <div className="intel-examples">
              <div className="section-eyebrow">Try one</div>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="intel-example"
                  onClick={() => void ask(example)}
                >
                  {example}
                  <span aria-hidden>→</span>
                </button>
              ))}
            </div>
          ) : null}

          <div ref={scroller} style={{ marginTop: 32, display: "grid", gap: 40 }}>
            {turns.map((turn, index) => (
              <TurnView
                key={index}
                turn={turn}
                onFollowup={(q) => void ask(q)}
                onRetry={() => void ask(turn.question)}
                busy={busy}
              />
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
              alignItems: "flex-end",
            }}
          >
            <textarea
              className="api-key-input"
              rows={1}
              style={{ flex: 1, resize: "none", minHeight: 46, lineHeight: 1.5 }}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                turns.length
                  ? "Ask a follow-up, or change the scenario…"
                  : "Ask about a duty, an eligibility, a corridor, or a what-if…"
              }
            />
            {busy ? (
              <button
                className="btn-ghost"
                type="button"
                onClick={() => abort.current?.abort()}
              >
                Stop
              </button>
            ) : null}
            <button className="btn-primary" type="submit" disabled={busy || !input.trim()}>
              {busy ? "Working…" : "Ask"}
              <span className="btn-arrow">→</span>
            </button>
          </form>

          {last?.running ? (
            <div className="how-copy" style={{ marginTop: -8 }}>
              Corridor is working through it. Long questions take a minute.
            </div>
          ) : null}
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
  chokepoint_profile: "Profiling the chokepoint",
  infrastructure_coverage: "Checking infrastructure coverage",
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

function TurnView({
  turn,
  onFollowup,
  onRetry,
  busy,
}: {
  turn: Turn;
  onFollowup: (question: string) => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const done = turn.steps.filter((s) => s.kind === "tool" && s.result).length;
  const total = turn.steps.filter((s) => s.kind === "tool").length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(turn.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; nothing worth saying */
    }
  }

  return (
    <article className="intel-turn">
      <div className="intel-question">{turn.question}</div>

      {turn.steps.length ? (
        <div className="intel-steps">
          <div className="section-eyebrow">
            What Corridor did{total ? ` — ${done}/${total} checks` : ""}
            {turn.seconds ? ` — ${turn.seconds}s` : ""}
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
        <>
          <AnswerBody text={turn.answer} />
          <div className="intel-actions">
            <button type="button" className="intel-action" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy answer"}
            </button>
            <button type="button" className="intel-action" onClick={onRetry} disabled={busy}>
              Run again
            </button>
          </div>
        </>
      ) : turn.running ? (
        <div className="how-copy">Working through it…</div>
      ) : null}

      {turn.stopped ? <div className="how-copy">Stopped.</div> : null}

      {turn.followups.length ? (
        <div className="intel-followups">
          <div className="section-eyebrow">Ask next</div>
          {turn.followups.map((question) => (
            <button
              key={question}
              type="button"
              className="intel-example"
              onClick={() => onFollowup(question)}
              disabled={busy}
            >
              {question}
              <span aria-hidden>→</span>
            </button>
          ))}
        </div>
      ) : null}

      {turn.error ? (
        <div className="intel-error">
          {turn.error}
          <button
            type="button"
            className="intel-action"
            onClick={onRetry}
            disabled={busy}
            style={{ marginLeft: 12 }}
          >
            Try again
          </button>
        </div>
      ) : null}
    </article>
  );
}
