"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startWhatsAppLogin } from "../whatsapp-actions";

/**
 * "Continue with WhatsApp" (shown only with WHATSAPP_LOGIN=1): opens WhatsApp with the code typed in, then polls
 * /api/auth/whatsapp/status every 2 s and goes to `next` (already made safe by the page) once she has sent it.
 */
export function WhatsAppLogin({ next }: { next: string }) {
  const [state, setState] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/auth/whatsapp/status", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ pending: true }));
      if (r.ok) {
        clearInterval(t);
        window.location.replace(next);
      } else if (r.expired) {
        clearInterval(t);
        setState(null);
        setError(r.error ?? "That code has expired. Tap Continue with WhatsApp again.");
      }
    }, 2000);
    return () => clearInterval(t);
  }, [state, next]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await startWhatsAppLogin().catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setState({ code: r.code, url: r.url });
    // Phones: WhatsApp opens over this page (same tab); desktops: a new tab, so this page keeps polling.
    if (window.matchMedia("(pointer: coarse)").matches) window.location.href = r.url;
    else window.open(r.url, "_blank", "noopener");
  };

  return (
    <div className="mt-6 grid gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {state ? (
        <div role="status" className="grid gap-2 rounded-md border border-border px-4 py-3 text-sm">
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Waiting for your WhatsApp message…
          </p>
          <p>
            Your code: <span className="numeric font-semibold tracking-widest">{state.code}</span>
          </p>
          <p className="text-muted-foreground">
            Didn&apos;t open? <a href={state.url} target="_blank" rel="noopener" className="text-foreground underline hover:text-sky">Open WhatsApp</a>, or send this code to +91 70114 88467.
          </p>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="lg" onClick={start} aria-disabled={busy || undefined} className="aria-disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Continue with WhatsApp
        </Button>
      )}
      {error && <p role="alert" className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
    </div>
  );
}
