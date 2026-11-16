"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { beacon } from "@/features/funnel/components/beacon";
import { PLAN_PROMPT_COOKIE } from "../prompt";

/**
 * The plan pop-up right after signing in ("Choose your plan": the plan cards), over the planner; a bottom sheet on phones. "Not now", ×, Esc or a
 * click outside closes it for this sign-in. A fixed layer rather than <dialog>: the top layer would sit above Razorpay's
 * checkout when she pays from here. Funnel: plan_popup_shown when it opens, plan_popup_dismissed when she closes it (an
 * Upgrade in it is data-placement "popup"; upgrading unmounts it without a dismiss). Not over the plan page, which is the
 * same choice (and where sign-up lands her with a coupon to apply): it waits for her next page.
 */
export function PlanPrompt({ title, children }: { title: string; children: React.ReactNode }) {
  const [shown, setOpen] = useState(true);
  const path = usePathname();
  const open = shown && path !== "/decide/plan";
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    document.cookie = `${PLAN_PROMPT_COOKIE}=; Max-Age=0; path=/`;
    setOpen(false);
    beacon({ name: "plan_popup_dismissed" });
  }, []);
  useEffect(() => void (open && beacon({ name: "plan_popup_shown" })), [open]);
  useEffect(() => {
    if (!open) return; // closed: Esc does nothing (and isn't a second dismissal)
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid items-end bg-black/50 sm:place-items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="plan-prompt-h" data-placement="popup" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 pb-0 shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="plan-prompt-h" className="text-lg font-semibold">{title}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-md hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
        {/* Pinned to the sheet's bottom: Not now is in reach without scrolling past the plans. */}
        <div className="sticky bottom-0 -mx-5 mt-3 bg-card px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={close} className="min-h-11 w-full rounded-md border border-border text-sm font-semibold">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
