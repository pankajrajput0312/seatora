"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Hide = (id: string) => Promise<{ ok: true; data: null } | { ok: false; error: string }>;
type Step = "idle" | "confirm" | "hidden" | "failed";

/**
 * A resident as a card (`<li>`) with the Residents table's two-step "Hide" (Hide, then Confirm). Once hidden the card
 * says so in place and takes focus; the next page load leaves it out. `children` are the card's contents.
 * ponytail: the card twin of residents/hideable-row.tsx (same steps and focus); share one hook when both can change.
 */
export function HideableCard({ id, name, hide, children }: { id: string; name: string; hide: Hide; children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("idle");
  const [pending, start] = useTransition();
  const refs = { idle: useRef<HTMLButtonElement>(null), confirm: useRef<HTMLButtonElement>(null), hidden: useRef<HTMLParagraphElement>(null) };
  // Focus follows the step the user moved to (Hide → Confirm → done; Cancel → Hide), never on mount.
  const moved = useRef(false);
  const go = (s: Step) => {
    moved.current = true;
    setStep(s);
  };
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    refs[step === "failed" ? "confirm" : step].current?.focus();
  });

  if (step === "hidden")
    return (
      <li className="min-w-0">
        <p ref={refs.hidden} tabIndex={-1} role="status" className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">Hidden. This name won&apos;t be shown again.</p>
      </li>
    );
  return (
    <li className="min-w-0">
      <article className="rounded-xl border border-border bg-card p-4">
        {children}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
          {step === "idle" ? (
            <Button ref={refs.idle} variant="ghost" onClick={() => go("confirm")} aria-label={`Hide ${name}`}>Hide</Button>
          ) : (
            <>
              {step === "failed" && <span role="alert" className="text-xs text-ember">Couldn&apos;t hide. Try again.</span>}
              <Button
                ref={refs.confirm}
                variant="danger"
                disabled={pending}
                aria-label={`Confirm: hide ${name}`}
                onClick={() => start(async () => go((await hide(id).catch(() => ({ ok: false }) as const)).ok ? "hidden" : "failed"))}
              >
                {pending ? "Hiding…" : "Confirm"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => go("idle")}>Cancel</Button>
            </>
          )}
        </div>
      </article>
    </li>
  );
}
