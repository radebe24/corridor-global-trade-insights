/* What moved.
 *
 * The watch runner writes check history into each project. This reads it back
 * for one signed-in caller and collapses it into the feed: what changed,
 * ranked escalated first, with the unchanged reduced to a count.
 *
 * Unlike the runner, this is a user endpoint. It uses the caller's own bearer
 * token so row-level security scopes the read to their projects, exactly as
 * the workspace does. There is no service-role client here and there must
 * never be one. */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { buildFeed } from "@/lib/corridor/domain";

function userClient(token: string) {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export const Route = createFileRoute("/api/feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return new Response("Sign in to read the feed.", { status: 401 });

        const supabase = userClient(token);
        const { data: user, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user.user)
          return new Response("Sign in to read the feed.", { status: 401 });

        const { data: rows, error } = await supabase.from("projects").select("id, name, data");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const since = Number(new URL(request.url).searchParams.get("since")) || 0;

        /* The feed reads across every project the caller owns, not just the
           active one. A lane that moved in a project they are not looking at
           is exactly the thing they would otherwise miss. */
        type Lane = { label?: string };
        const lanes: Lane[] = [];
        for (const row of rows ?? []) {
          const project = (row.data ?? {}) as { lanes?: Lane[] };
          for (const lane of project.lanes ?? []) {
            lanes.push({
              ...lane,
              label: lane.label ? `${lane.label} · ${row.name ?? "Project"}` : row.name,
            });
          }
        }

        const feed = buildFeed(lanes, since || undefined);
        return Response.json({
          ...feed,
          lanes_watched: lanes.length,
        });
      },
    },
  },
});
