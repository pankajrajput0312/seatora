"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { navigating, toast } from "@/features/decide/components/nav-pending";
import { cn } from "@/lib/cn";

/**
 * Redeems a code through the order route: a 100% coupon gives the whole Season Pass at once (no Razorpay); any other
 * code gets the server's reason (`message`). On success the button stays busy until the refreshed page swaps the card
 * (the refresh joins this transition), then the toast says it (`done(coupon)`): this form unmounts once the pass is on.
 */
function useRedeem(done: (coupon: string) => string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const applied = useRef<string | null>(null);
  useEffect(() => () => void (applied.current && toast(applied.current)), []);
  const redeem = (code: string) =>
    start(async () => {
      setMessage(null);
      const res = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!body?.free) return setMessage(body?.error?.message ?? "Couldn't apply the coupon. Try again.");
      applied.current = done(body.coupon);
      navigating(true); // inside Decide: the shell keeps the refresh moving (decide-shell.tsx)
      router.refresh();
    });
  return { pending, message, redeem };
}

/** "Have a coupon?" where there is no paid checkout (the free period, or payments off). `initialCode` (?coupon=) opens it filled in. */
export function CouponForm({ initialCode, done, noteClassName }: { initialCode?: string | null; done: string; noteClassName?: string }) {
  const id = useId();
  const { pending, message, redeem } = useRedeem((c) => `${c} applied: ${done}`);
  return (
    <details open={!!initialCode} className={cn("mt-2 text-xs", noteClassName)}>
      {/* hit: a 44px touch target around the small words. */}
      <summary className="hit w-fit cursor-pointer">Have a coupon?</summary>
      {/* onSubmit, not action: a POST form dims the Decide shell until the address changes (nav-pending.tsx), and this one never navigates. */}
      <form onSubmit={(e) => {
          e.preventDefault();
          redeem(String(new FormData(e.currentTarget).get("code") ?? ""));
        }} className="mt-1.5 flex gap-2">
        <label htmlFor={id} className="sr-only">Coupon code</label>
        <input id={id} name="code" required maxLength={20} defaultValue={initialCode ?? ""} autoComplete="off" spellCheck={false} placeholder="CODE" className="h-9 w-32 rounded-md border border-input bg-transparent px-2 text-sm uppercase text-foreground" />
        <button type="submit" disabled={pending} className="h-9 rounded-md border border-input px-3 text-sm font-semibold text-foreground disabled:opacity-50">{pending ? "Applying…" : "Apply"}</button>
      </form>
      {message && <p className="mt-1" role="status">{message}</p>}
    </details>
  );
}

/** A pending 100% coupon (?coupon=) as the main button: "Apply DRTARAL: free till 31 Mar 2027", in place of the free claim. */
export function ApplyCoupon({ code, label, done, className, noteClassName }: { code: string; label: string; done: string; className?: string; noteClassName?: string }) {
  const { pending, message, redeem } = useRedeem((c) => `${c} applied: ${done}`);
  return (
    <div>
      <button type="button" data-upgrade="" onClick={() => redeem(code)} disabled={pending} className={cn("inline-flex items-center justify-center disabled:opacity-50", className)}>
        {pending ? "Applying…" : label}
      </button>
      {message && <p role="status" className={cn("mt-1 text-xs", noteClassName)}>{message}</p>}
    </div>
  );
}
