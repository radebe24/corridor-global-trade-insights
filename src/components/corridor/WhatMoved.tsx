import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/* What moved since the last visit.
 *
 * This sits above the ask box so a returning user sees what changed before
 * they think of a question. It renders nothing at all when nothing has moved,
 * because a monitoring strip that is always present stops being read.
 *
 * The last-visit stamp is per browser, which is the right grain: the feed
 * answers "what happened while I was away from this screen", and each device
 * has its own away. */

const SEEN_KEY = "corridor.feed_seen";

type Moved = {
  itemId: string;
  laneLabel: string;
  subject: string;
  kind: string;
  status: "escalated" | "eased" | "new" | "unchanged";
  was: string | null;
  now: string;
  change: string;
  source: string;
  checkedAt: number;
};

type Feed = { moved: Moved[]; unchanged: number; latest: number; lanes_watched: number };

const STATUS_LABEL: Record<string, string> = {
  escalated: "Escalated",
  eased: "Eased",
  new: "New",
};

function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    /* private windows and blocked site data both land here; a zero just means
       the first load shows everything, which is the safe direction */
    return 0;
  }
}

function writeSeen(at: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    /* nothing to do; the feed simply repeats next visit */
  }
}

export function WhatMoved() {
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const since = readSeen();
      const response = await fetch(`/api/feed?since=${since}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || cancelled) return;

      const body = (await response.json()) as Feed;
      if (cancelled) return;
      setFeed(body);
      if (body.latest) writeSeen(body.latest);
    })().catch(() => {
      /* the feed is never the reason the page fails to load */
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!feed || !feed.moved.length) return null;

  return (
    <section className="intel-examples" style={{ marginBottom: 8 }}>
      <div className="section-eyebrow">
        What moved{feed.unchanged ? ` · ${feed.unchanged} unchanged` : ""}
      </div>

      {feed.moved.map((item) => (
        <div key={item.itemId} className="intel-step" style={{ padding: "12px 0" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{STATUS_LABEL[item.status] ?? item.status}</strong>
            <span>{item.subject}</span>
            <span className="how-copy" style={{ opacity: 0.7 }}>
              {item.laneLabel}
            </span>
          </div>
          <div className="how-copy" style={{ marginTop: 4 }}>
            {item.change || item.now}
          </div>
          {item.source ? (
            <a
              className="nav-link"
              href={item.source}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.85em" }}
            >
              Source
            </a>
          ) : null}
        </div>
      ))}
    </section>
  );
}
