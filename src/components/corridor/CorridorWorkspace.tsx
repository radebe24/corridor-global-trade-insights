import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { CORRIDOR_MARKUP } from "./markup";
import {
  hydrateCloudStore,
  flushCloudStore,
  setCorridorAccessToken,
} from "@/lib/corridor/cloud-store";

/* The workspace is the ported Corridor application. It owns its own DOM and
 * its own document-level listeners, so the container element is created once
 * and re-attached on every mount rather than rebuilt — a rebuilt container
 * would throw away everything the application has rendered into it.
 *
 * It needs a session before it boots. An anonymous trial session is enough:
 * every project it saves is a row scoped to that session by row-level
 * security, so trial work is private and can be claimed by signing up. */

let container: HTMLDivElement | null = null;
let bootPromise: Promise<void> | null = null;

export function CorridorWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    if (!container) {
      container = document.createElement("div");
      container.innerHTML = CORRIDOR_MARKUP;
    }
    mount.appendChild(container);

    if (!bootPromise) {
      bootPromise = (async () => {
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

        const { bootCorridor } = await import("@/lib/corridor/app-legacy");
        bootCorridor({ navigate: (to: string) => void navigate({ to }) });
      })();

      bootPromise.catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : "Corridor could not start.");
      });
    }

    return () => {
      if (container && container.parentNode === mount) mount.removeChild(container);
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
      <div ref={host} />
    </>
  );
}
