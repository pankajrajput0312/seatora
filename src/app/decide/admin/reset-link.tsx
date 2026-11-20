"use client";

import { useState, useTransition } from "react";
import { createResetLink } from "./actions";

const button = "inline-flex min-h-9 items-center rounded-md border border-edge bg-card px-3 text-sm font-semibold shadow-xs hover:border-input hover:bg-muted";

/** "Create reset link": shows the one-time link once (state only, gone on reload) with a Copy button, to send to her. */
export function ResetLink({ userId, email }: { userId: string; email: string }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Awaited<ReturnType<typeof createResetLink>> | null>(null);
  const [copied, setCopied] = useState(false);
  if (r?.ok)
    return (
      <span className="mt-2 grid gap-1 text-xs">
        <span className="flex flex-wrap items-center gap-2">
          <input readOnly value={r.link} aria-label={`Reset link for ${email}`} onFocus={(e) => e.currentTarget.select()} className="h-9 w-64 rounded-md border border-input bg-card px-2 font-mono text-xs" />
          <button type="button" className={button} onClick={() => navigator.clipboard.writeText(r.link).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</button>
        </span>
        <span role="status" className="text-muted-foreground">
          Shown once. Works once, till {new Date(r.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST. Send it only to {email}.
        </span>
      </span>
    );
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={`${button} disabled:opacity-60`} onClick={() => start(async () => setR(await createResetLink(userId)))}>
        {pending ? "Creating…" : "Create reset link"}
      </button>
      {r && !r.ok && <span role="alert" className="text-xs text-ember">{r.error}</span>}
    </span>
  );
}
