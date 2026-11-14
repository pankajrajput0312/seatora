"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Hide = (id: string) => Promise<{ ok: true; data: null } | { ok: false; error: string }>;
type Step = "idle" | "confirm" | "hidden" | "failed";

/**
 * A Residents table row with a two-step "Hide" (Hide, then Confirm). Once hidden the row says so in place and takes
 * focus; the next page load leaves it out. `children` are the row's cells.
 */
export function HideableRow({ id, name, hide, colSpan, className, children }: { id: string; name: string; hide: Hide; colSpan: number; className?: string; children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("idle");
  const [pending, start] = useTransition();
  const refs = { idle: useRef<HTMLButtonElement>(null), confirm: useRef<HTMLButtonElement>(null), hidden: useRef<HTMLTableCellElement>(null) };
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
      <tr className={className}>
        <td ref={refs.hidden} tabIndex={-1} colSpan={colSpan} role="status" className="px-4 py-3 text-sm text-muted-foreground">Hidden. This name won&apos;t be shown again.</td>
      </tr>
    );
  return (
    <tr className={className}>
      {children}
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {step === "idle" ? (
          <Button ref={refs.idle} variant="ghost" onClick={() => go("confirm")} aria-label={`Hide ${name}`}>Hide</Button>
        ) : (
          <span className="inline-flex items-center gap-1">
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
          </span>
        )}
      </td>
    </tr>
  );
}
