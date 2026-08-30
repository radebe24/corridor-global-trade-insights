import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const title = "Account — Corridor";
const description =
  "Sign in to Corridor to keep your projects, saved analyses and watch items across devices.";

export const Route = createFileRoute("/auth")({
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
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setIsAnonymous(data.user?.is_anonymous === true);
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  /* An anonymous trial session is upgraded in place, so the projects the
     visitor already created stay attached to the same account. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const address = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user?.is_anonymous) {
          const { error: updateError } = await supabase.auth.updateUser({
            email: address,
            password,
          });
          if (updateError) throw updateError;
        } else {
          const { error: signUpError } = await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
          if (signUpError) throw signUpError;
        }
      }
      void navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete that.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in did not complete.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
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
              Back to the workspace
            </Link>
          </div>
        </div>
      </nav>

      <main className="hero">
        <div className="container" style={{ maxWidth: 480, padding: "64px 0 96px" }}>
          <div className="section-eyebrow">Account</div>

          {email ? (
            <>
              <h1 className="section-title">Signed in as {email}</h1>
              <p className="usecases-sub">
                Your projects follow this account on any device.
              </p>
              <div style={{ marginTop: 24 }}>
                <button className="btn-ghost" type="button" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="section-title">
                {mode === "signup" ? "Keep your work" : "Sign back in"}
              </h1>
              <p className="usecases-sub">
                {mode === "signup" && isAnonymous
                  ? "You are on a trial session. Add an email and password and everything you have already built moves with you."
                  : "Sign in to reach your Corridor projects from any device."}
              </p>

              <form onSubmit={onSubmit} style={{ marginTop: 28, display: "grid", gap: 16 }}>
                <label className="settings-field">
                  <span>Work email</span>
                  <input className="api-key-input" type="email" name="email" required />
                </label>
                <label className="settings-field">
                  <span>Password</span>
                  <input
                    className="api-key-input"
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </label>

                {error ? (
                  <div style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</div>
                ) : null}
                {notice ? <div style={{ fontSize: 13 }}>{notice}</div> : null}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="btn-primary" type="submit" disabled={busy}>
                    {mode === "signup" ? "Create the account" : "Sign in"}
                    <span className="btn-arrow">→</span>
                  </button>
                  <button className="btn-ghost" type="button" onClick={onGoogle}>
                    Continue with Google
                  </button>
                </div>
              </form>

              <button
                className="nav-link"
                type="button"
                style={{ marginTop: 20 }}
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError(null);
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Need an account? Create one"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
