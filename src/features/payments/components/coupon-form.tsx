"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { navigating } from "@/features/decide/components/nav-pending";
import { cn } from "@/lib/cn";

/**
 * "Have a coupon?" where there is no paid checkout (the free period, or payments off): a 100% coupon gives the whole
 * Season Pass at once through the order route (no Razorpay); any other code gets the server's reason. `initialCode`
 * (?coupon=) opens it filled in; she still presses Apply.
 */
export function CouponForm({ initialCode, noteClassName }: { initialCode?: string | null; noteClassName?: string }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const redeem = (form: FormData) =>
    start(async () => {
      setMessage(null);
      const res = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: String(form.get("code") ?? "") }) }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!body?.free) return setMessage(body?.error?.message ?? "Couldn't apply the coupon. Try again.");
      setMessage(`Season Pass active — coupon ${body.coupon} applied`);
      navigating(true); // inside Decide: the shell keeps the refresh moving (decide-shell.tsx)
      router.refresh();
    });
  return (
    <details open={!!initialCode} className={cn("mt-2 text-xs", noteClassName)}>
      <summary className="cursor-pointer">Have a coupon?</summary>
      {/* onSubmit, not action: a POST form dims the Decide shell until the address changes (nav-pending.tsx), and this one never navigates. */}
      <form onSubmit={(e) => {
          e.preventDefault();
          redeem(new FormData(e.currentTarget));
        }} className="mt-1.5 flex gap-2">
        <label htmlFor={id} className="sr-only">Coupon code</label>
        <input id={id} name="code" required maxLength={20} defaultValue={initialCode ?? ""} autoComplete="off" spellCheck={false} placeholder="CODE" className="h-9 w-32 rounded-md border border-input bg-transparent px-2 text-sm uppercase text-foreground" />
        <button type="submit" disabled={pending} className="h-9 rounded-md border border-input px-3 text-sm font-semibold text-foreground disabled:opacity-50">{pending ? "Applying…" : "Apply"}</button>
      </form>
      {message && <p className="mt-1" role="status">{message}</p>}
    </details>
  );
}
