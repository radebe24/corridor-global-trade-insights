/* The watch runner.
 *
 * Corridor's whole watch layer already existed: what to watch on a lane, how
 * to ask about it, how to read the answer back, and how to keep the history.
 * It only ever ran in the browser, while somebody had a tab open. For a
 * product whose value is "the preference lapsed and it costs you $400k", that
 * is the wrong place for it.
 *
 * This is the same layer, fired on a schedule. Each run picks the stalest
 * items across every project, asks one question per item with a live search
 * behind it, and records the answer against the prior state so the feed can
 * say what moved rather than what is true.
 *
 * It is a cron endpoint, not a user endpoint. It authenticates with the shared
 * cron secret and reads every project with a service-role client, because the
 * scheduler has no user session and projects are row-level scoped to theirs. */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { ensureCorridorData, useDataOrigin } from "@/lib/corridor/agent-tools.server";
import { MODEL } from "@/lib/corridor/model";
import {
  refreshWatchItems,
  isStale,
  lastCheck,
  watchCheckPrompt,
  parseWatchCheck,
  recordCheck,
  WATCH_STALE_DAYS,
} from "@/lib/corridor/domain";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/* A firing must not fan out into hundreds of searches. A large tenant drains
   over several firings instead of one enormous one, stalest first. */
const MAX_ITEMS_PER_RUN = 25;
const CONCURRENCY = 3;

type Candidate = { project: any; lane: any; item: any };

function serviceClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* One question, one search, one structured answer. watchCheckPrompt already
   carries the prior state and pins the reply to four labelled lines, so there
   is nothing to parse loosely and no room for a fresh description where a diff
   was asked for. */
async function checkItem(apiKey: string, item: any) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You are Corridor's monitoring analyst. You are checking one watched subject for change since it was last seen. Search before answering. Answer in the exact four-line shape you are given and write nothing else.",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: watchCheckPrompt(item) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed [${response.status}]: ${await response.text()}`);
  }

  const reply: any = await response.json();
  const text = (reply.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  return parseWatchCheck(text);
}

/* Bounded fan-out. Promise.all over the whole batch would put 25 searches in
   flight at once and rate-limit the run into failure. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export const Route = createFileRoute("/api/watch-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const apiKey = process.env["ANTHROPIC_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "No Anthropic API key configured." }, { status: 503 });
        }

        const supabase = serviceClient();
        if (!supabase) {
          return Response.json(
            {
              error:
                "The watch runner needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. It reads every tenant's projects, which a publishable key cannot do.",
            },
            { status: 503 },
          );
        }

        /* The tools resolve their datasets over HTTP against this app, and the
           chokepoint register has to be loaded before a lane can name what it
           passes through. Without it every chokepoint watch item silently
           fails to exist. */
        useDataOrigin(new URL(request.url).origin);
        await ensureCorridorData();

        const { data: rows, error } = await supabase.from("projects").select("id, data");
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        /* Re-derive first. A lane whose route or HTS line changed gains and
           loses watch items, and the ones that survive keep their history. */
        const candidates: Candidate[] = [];
        const projects = (rows ?? []).map((row) => ({ rowId: row.id, data: row.data as any }));

        for (const project of projects) {
          for (const lane of project.data?.lanes ?? []) {
            lane.watch = refreshWatchItems(lane);
            for (const item of lane.watch) {
              if (isStale(item, WATCH_STALE_DAYS)) candidates.push({ project, lane, item });
            }
          }
        }

        /* Stalest first, so nothing starves behind a busy project. */
        candidates.sort((a, b) => {
          const at = lastCheck(a.item)?.checkedAt ?? 0;
          const bt = lastCheck(b.item)?.checkedAt ?? 0;
          return at - bt;
        });
        const batch = candidates.slice(0, MAX_ITEMS_PER_RUN);

        let moved = 0;
        const failures: { subject: string; error: string }[] = [];
        const touched = new Set<any>();

        await inBatches(batch, CONCURRENCY, async ({ project, item }) => {
          try {
            const result = await checkItem(apiKey, item);
            recordCheck(item, result);
            if (result.status !== "unchanged") moved++;
            touched.add(project);
          } catch (err) {
            /* One failed check does not abort the run. The item stays stale,
               so the next firing retries it without any bookkeeping. */
            failures.push({
              subject: item.subject,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        /* Only projects that actually recorded a check are written back. A
           re-derivation that recorded nothing is reproduced free on the next
           firing, so it is not worth a write. */
        for (const project of projects) {
          if (!touched.has(project)) continue;
          const { error: writeError } = await supabase
            .from("projects")
            .update({ data: project.data })
            .eq("id", project.rowId);
          if (writeError) {
            failures.push({ subject: `project ${project.rowId}`, error: writeError.message });
          }
        }

        return Response.json({
          projects_scanned: projects.length,
          items_stale: candidates.length,
          items_checked: batch.length - failures.length,
          items_moved: moved,
          items_deferred: Math.max(0, candidates.length - batch.length),
          failures,
        });
      },
    },
  },
});
