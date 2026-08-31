import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

const title = "Request an analysis — Corridor";
const description =
  "Send Corridor your sourcing book. We code every line to the US tariff schedule, price the duty, and find the origins that cost less.";

export const Route = createFileRoute("/request")({
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
  component: RequestAnalysis,
});

function RequestAnalysis() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    const form = new FormData(event.currentTarget);
    const file = form.get("book");

    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        sessionData = { session: data.session };
      }
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Could not start a session.");

      let filePath: string | null = null;
      if (file instanceof File && file.size > 0) {
        const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("sourcing-books")
          .upload(path, file);
        if (uploadError) throw uploadError;
        filePath = path;
      }

      const { error: insertError } = await supabase.from("analysis_requests").insert({
        user_id: userId,
        contact_name: String(form.get("name") ?? "").trim(),
        contact_email: String(form.get("email") ?? "").trim(),
        company: String(form.get("company") ?? "").trim() || null,
        sku_count: String(form.get("skus") ?? "").trim() || null,
        origins: String(form.get("origins") ?? "").trim() || null,
        notes: String(form.get("notes") ?? "").trim() || null,
        file_path: filePath,
      });
      if (insertError) throw insertError;

      setStatus("sent");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStatus("idle");
    }
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-inner">
          <Link className="nav-brand" to="/">
            <span>Corridor</span>
          </Link>
          <div className="nav-links">
            <Link className="nav-link" to="/workspace">
              Back to the workspace
            </Link>
          </div>
        </div>
      </nav>

      <main className="hero">
        <div className="container" style={{ maxWidth: 720, padding: "64px 0 96px" }}>
          <div className="section-eyebrow">Request an analysis</div>
          <h1 className="section-title">Send us the book you already keep.</h1>
          <p className="usecases-sub">
            A spreadsheet with a product description and a country of origin on each row. Whatever
            format it is in — we work out the columns.
          </p>

          {status === "sent" ? (
            <div className="how-step" style={{ marginTop: 32 }}>
              <div className="how-num">01</div>
              <div className="how-title">Request received</div>
              <div className="how-copy">
                We have your sourcing book and will come back with the priced analysis and the
                workbook behind it.{" "}
                <Link to="/workspace" className="nav-link">
                  Open the workspace
                </Link>{" "}
                in the meantime.
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ marginTop: 32, display: "grid", gap: 18 }}>
              <Field label="Your name" name="name" required />
              <Field label="Work email" name="email" type="email" required />
              <Field label="Company" name="company" />
              <Field label="Roughly how many SKUs" name="skus" placeholder="e.g. 400" />
              <Field
                label="Origins you buy from"
                name="origins"
                placeholder="e.g. Vietnam, Kenya, Bangladesh"
              />

              <label className="settings-field">
                <span>Anything we should know</span>
                <textarea
                  name="notes"
                  rows={4}
                  className="api-key-input"
                  style={{ resize: "vertical" }}
                />
              </label>

              <label className="settings-field">
                <span>Sourcing book (spreadsheet, optional)</span>
                <input
                  type="file"
                  name="book"
                  accept=".csv,.xlsx,.xls,.tsv,.txt"
                  className="api-key-input"
                />
              </label>

              {error ? (
                <div style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</div>
              ) : null}

              <div>
                <button className="btn-primary" type="submit" disabled={status === "sending"}>
                  {status === "sending" ? "Sending…" : "Send the request"}
                  <span className="btn-arrow">→</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        className="api-key-input"
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
}
