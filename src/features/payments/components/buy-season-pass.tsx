"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { business } from "@/config/business";
import { cn } from "@/lib/cn";

// Razorpay Standard Checkout for the Season Pass: the order route sets the amount, the modal takes the payment, verify
// confirms it (the webhook covers a closed tab). checkout.js loads only where this button is shown to a signed-in buyer.

type Status = "signed_out" | "can_buy" | "paid";
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const free = business.price === 0;

/**
 * `status` from the server where it knows (the planner); left out on static pages, it is read from the signed-in flag
 * cookie and a paid pass shows up when the order route answers 409.
 */
export function BuySeasonPass({ status: initial, next, className, noteClassName }: { status?: Status; next: string; className?: string; noteClassName?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    if (!initial) setStatus(document.cookie.split("; ").includes("medpath_signed_in=1") ? "can_buy" : "signed_out");
  }, [initial]);

  const note = free && <p className={cn("mt-1 text-xs", noteClassName)}>Free till 19 Nov — pay now to keep access after</p>;
  const label = free ? "Get Season Pass" : `Buy Season Pass · ₹${business.regularPrice}`;

  if (status === "paid") return <p className={cn("text-sm font-semibold", noteClassName)} role="status">Season Pass active</p>;
  if (status !== "can_buy")
    return (
      <div>
        <Link href={`/signup?${new URLSearchParams({ next })}`} className={cn("inline-flex items-center justify-center", className)}>{label}</Link>
        {note}
      </div>
    );

  async function buy() {
    setBusy(true);
    setMessage(null);
    failed.current = false;
    try {
      const res = await fetch("/api/payments/order", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return router.push(`/login?${new URLSearchParams({ next })}`);
      if (res.status === 409) return setStatus("paid");
      if (!res.ok) return setMessage(body?.error?.message ?? "Couldn't start the payment. Try again.");
      if (!window.Razorpay) return setMessage("The payment window didn't load. Check your connection and try again.");
      const rzp = new window.Razorpay({
        key: body.keyId,
        amount: body.amount,
        currency: body.currency,
        order_id: body.orderId,
        name: "Seatora",
        description: "Season Pass",
        prefill: { email: body.email },
        theme: { color: "#0b0e12" },
        handler: (r: RazorpayResponse) => void confirm(r),
        modal: {
          ondismiss: () => {
            setBusy(false);
            if (!failed.current) setMessage("Payment cancelled");
          },
        },
      });
      rzp.on("payment.failed", (r) => {
        failed.current = true;
        setMessage(`Payment failed: ${r.error?.description ?? "please try again"}`);
      });
      rzp.open();
    } catch {
      setMessage("Network error. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function confirm(r: RazorpayResponse) {
    setBusy(true);
    setMessage("Confirming your payment…");
    try {
      const res = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      if (!res.ok) throw new Error();
      setMessage(null);
      setStatus("paid");
      router.refresh();
    } catch {
      setMessage("Paid, but we couldn't confirm it yet. Refresh in a few minutes; if it's still not active, contact us with your payment id " + r.razorpay_payment_id + ".");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <button type="button" onClick={buy} disabled={busy} className={cn("inline-flex items-center justify-center disabled:opacity-50", className)}>
        {busy ? "Opening payment…" : label}
      </button>
      {note}
      {message && <p className={cn("mt-1 text-xs", noteClassName)} role="status">{message}</p>}
    </div>
  );
}
