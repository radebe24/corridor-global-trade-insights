/* Server-side Claude call.
 *
 * The original app sent the user's own Anthropic key straight from the
 * browser. The key now lives only here, and the request must carry a valid
 * session so this is not an open model proxy. The upstream SSE stream is
 * passed through untouched, so the client parses exactly what it did before. */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODEL_PREFIX = "claude-";

async function requireSession(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
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

export const Route = createFileRoute("/api/anthropic")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireSession(request);
        if (!user) return new Response("Sign in to run an analysis.", { status: 401 });

        const apiKey = process.env["ANTHROPIC_API_KEY"];
        if (!apiKey) {
          return new Response(
            "Corridor is not connected to Claude yet. Add an Anthropic API key to the project.",
            { status: 503 },
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Invalid request body.", { status: 400 });
        }

        const model = typeof body["model"] === "string" ? (body["model"] as string) : "";
        if (!model.startsWith(ALLOWED_MODEL_PREFIX)) {
          return new Response("Unsupported model.", { status: 400 });
        }
        if (!Array.isArray(body["messages"]) || (body["messages"] as unknown[]).length === 0) {
          return new Response("Messages are required.", { status: 400 });
        }

        const upstream = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          console.error(`Anthropic request failed [${upstream.status}]: ${text}`);
          return new Response(text, {
            status: upstream.status,
            headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/plain" },
          });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
