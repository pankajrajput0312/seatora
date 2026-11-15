"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ResultCard } from "./result-card";
import { HideableRow } from "./residents/hideable-row";

type Hide = (id: string) => Promise<{ ok: true; data: null } | { ok: false; error: string }>;
type Step = "idle" | "confirm" | "hidden" | "failed";
const HIDDEN = "Hidden. This name won't be shown again.";

// Names hidden since this page loaded. The cards and the table are both in the page (ViewPanes), so a name hidden in
// one view shows as hidden in the other too, before any reload.
const hiddenNow = new Set<string>();
const subs = new Set<() => void>();
const markHidden = (id: string) => {
  hiddenNow.add(id);
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
const useHiddenNow = (id: string) => useSyncExternalStore(subscribe, () => hiddenNow.has(id), () => false);

/**
 * A resident as a ResultCard with the Residents table's two-step "Hide" (Hide, then Confirm) in its header. Once hidden
 * the card says so in place and takes focus; the next page load leaves it out. The rest of the props are ResultCard's.
 * ponytail: the card twin of residents/hideable-row.tsx (same steps and focus); share one hook when both can change.
 */
export function HideableCard({ id, name, hide, ...card }: { id: string; name: string; hide: Hide } & Omit<React.ComponentProps<typeof ResultCard>, "actions">) {
  const [step, setStep] = useState<Step>("idle");
  const gone = useHiddenNow(id);
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

  if (step === "hidden" || gone)
    return <p ref={refs.hidden} tabIndex={-1} role="status" className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">{HIDDEN}</p>;
  const actions =
    step === "idle" ? (
      <Button ref={refs.idle} variant="ghost" onClick={() => go("confirm")} aria-label={`Hide ${name}`}>Hide</Button>
    ) : (
      <>
        <Button
          ref={refs.confirm}
          variant="danger"
          disabled={pending}
          aria-label={`Confirm: hide ${name}`}
          onClick={() =>
            start(async () => {
              const ok = (await hide(id).catch(() => ({ ok: false }) as const)).ok;
              go(ok ? "hidden" : "failed");
              if (ok) markHidden(id);
            })
          }
        >
          {pending ? "Hiding…" : "Confirm"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => go("idle")}>Cancel</Button>
      </>
    );
  return (
    <ResultCard
      {...card}
      actions={actions}
      // Below the card, not in its header: the header has no room for it beside Confirm and Cancel at 390px.
      footer={step === "failed" ? <p role="alert" className="px-4 py-2 text-xs text-ember">Couldn&apos;t hide. Try again.</p> : card.footer}
    />
  );
}

/** HideableRow for the Residents page: hides with its card (the other view), and shows as hidden when the card was. */
export function SyncedHideableRow(props: React.ComponentProps<typeof HideableRow>) {
  const gone = useHiddenNow(props.id);
  // Hidden from this row: HideableRow shows it (with its focus move).
  const [own, setOwn] = useState(false);
  if (gone && !own)
    return (
      <tr className={props.className}>
        <td colSpan={props.colSpan} role="status" className="px-4 py-3 text-sm text-muted-foreground">{HIDDEN}</td>
      </tr>
    );
  const hide = async (id: string) => {
    const r = await props.hide(id);
    if (r.ok) {
      setOwn(true);
      markHidden(id);
    }
    return r;
  };
  return <HideableRow {...props} hide={hide} />;
}
