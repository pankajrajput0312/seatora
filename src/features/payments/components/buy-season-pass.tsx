"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { applyReferralCode } from "@/features/referrals/actions";
import { formatPaise } from "@/features/referrals/lib";
import { cn } from "@/lib/cn";

// Razorpay Standard Checkout for the Season Pass: the order route sets the amount, the modal takes the payment, verify
// confirms it (the webhook covers a closed tab). checkout.js loads only where this button is shown to a signed-in buyer.

const NEXT = "/pricing#buy";
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export type Offer = {
  /** Her price in paise (the server's quote: 20% off with a referrer). Display only: the order route decides. */
  amount: number;
  /** The price without a referral, paise. */
  listAmount: number;
  /** The referrer's first name when the price is discounted. */
  inviter: string | null;
  /** The referral code to send with the order (from the /r/ cookie or typed here). */
  code: string | null;
};

/**
 * For a signed-in buyer; use through SeasonPassButton, which knows her state and price. The button reads
 * "<verb> · ₹399 with Rahul's invite". "Have a referral code?" shows only to a buyer with no discount yet.
 */
export function BuySeasonPass({ offer: initialOffer, verb, className, noteClassName }: { offer: Offer; verb: string; className?: string; noteClassName?: string }) {
  const router = useRouter();
  const [paid, setPaid] = useState(false);
  const [offer, setOffer] = useState(initialOffer);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const failed = useRef(false);

  const label = `${verb} · ${formatPaise(offer.amount)}${offer.inviter ? ` with ${offer.inviter}'s invite` : ""}`;

  if (paid) return <p className={cn("text-sm font-semibold", noteClassName)} role="status">Season Pass active</p>;

  async function apply(form: FormData) {
    setMessage(null);
    const r = await applyReferralCode(String(form.get("code") ?? ""));
    if (r.ok) setOffer((o) => ({ ...o, amount: r.amount, inviter: r.inviter, code: r.code }));
    else setMessage(r.error);
  }

  async function buy() {
    setBusy(true);
    setMessage(null);
    failed.current = false;
    try {
      // Only the code goes up: the server prices the order.
      const res = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(offer.code ? { referralCode: offer.code } : {}) });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return router.push(`/login?${new URLSearchParams({ next: NEXT })}`);
      if (res.status === 409) return setPaid(true);
      if (!res.ok) {
        if (body?.error?.code === "invalid_referral") setOffer((o) => ({ ...o, amount: o.listAmount, inviter: null, code: null }));
        setBusy(false);
        return setMessage(body?.error?.message ?? "Couldn't start the payment. Try again.");
      }
      setOffer((o) => ({ ...o, amount: body.amount, inviter: body.inviter }));
      if (!window.Razorpay) {
        setBusy(false);
        return setMessage("The payment window didn't load. Check your connection and try again.");
      }
      const rzp = new window.Razorpay({
        key: body.keyId,
        amount: body.amount,
        currency: body.currency,
        order_id: body.orderId,
        name: "Seatora",
        image: `${window.location.origin}/icons/icon-192.png`,
        description: body.discount ? `Season Pass · ${formatPaise(body.discount)} off with ${body.inviter}'s invite` : "Season Pass",
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
      setPaid(true);
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
      {!offer.inviter && (
        <details className={cn("mt-2 text-xs", noteClassName)}>
          <summary className="cursor-pointer">Have a referral code?</summary>
          <form action={apply} className="mt-1.5 flex gap-2">
            <label htmlFor="ref-code" className="sr-only">Referral code</label>
            <input id="ref-code" name="code" required maxLength={8} autoComplete="off" spellCheck={false} placeholder="CODE" className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm uppercase text-foreground" />
            <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm font-semibold text-foreground">Apply</button>
          </form>
        </details>
      )}
      {message && <p className={cn("mt-1 text-xs", noteClassName)} role="status">{message}</p>}
    </div>
  );
}
