import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { CORRIDOR_MARKUP } from "./markup";
import {
  hydrateCloudStore,
  flushCloudStore,
  setCorridorAccessToken,
} from "@/lib/corridor/cloud-store";

/* The workspace is the ported Corridor application. It needs a session before
 * it boots — an anonymous trial session is enough — because every project it
 * writes is a row scoped to that session. */
export function CorridorWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const booted = useRef(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let cancelled = false;

    (async () => {
      try {
        let { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          const { data, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw anonError;
          sessionData = { session: data.session };
        }

        const session = sessionData.session;
        if (!session) throw new Error("Could not start a session.");
        setCorridorAccessToken(session.access_token);

        await hydrateCloudStore(session.user.id);
        if (cancelled) return;

        const { bootCorridor } = await import("@/lib/corridor/app-legacy");
        if (cancelled) return;
        bootCorridor({ navigate: (to: string) => void navigate({ to }) });
        setReady(true);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Corridor could not start.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /* Keep the bearer fresh and make sure nothing in flight is lost on exit. */
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setCorridorAccessToken(session?.access_token ?? null);
    });
    const onLeave = () => {
      void flushCloudStore();
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("pagehide", onLeave);
      void flushCloudStore();
    };
  }, []);

  return (
    <>
      {error ? (
        <div className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
          {error}
        </div>
      ) : null}
      <div
        ref={host}
        data-corridor-ready={ready ? "true" : "false"}
        dangerouslySetInnerHTML={{ __html: CORRIDOR_MARKUP }}
      />
    </>
  );
}
