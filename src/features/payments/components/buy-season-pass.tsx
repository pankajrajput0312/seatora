"use client";

import { useId, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { navigating } from "@/features/decide/components/nav-pending";
import { beacon } from "@/features/funnel/components/beacon";
import { applyCode } from "@/features/referrals/actions";
import { formatPaise } from "@/features/referrals/lib";
import { cn } from "@/lib/cn";
import { PLANS } from "../plans";

// Razorpay Standard Checkout for the Season Pass: the order route sets the amount, the modal takes the payment, verify
// confirms it (the webhook covers a closed tab). checkout.js loads only where this button is shown to a signed-in buyer.
// Funnel (docs/FUNNEL.md): the button is an Upgrade (data-upgrade); closing the modal is checkout_cancelled, a declined
// payment payment_failed. The order route records checkout_opened, markPaid payment_paid.

const NEXT = "/pricing#buy";
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export type Offer = {
  /** Her price in paise (the server's: less a coupon, or 20% off with a referrer). Display only: the order route decides. */
  amount: number;
  /** The price without a discount, paise. */
  listAmount: number;
  /** The referrer's first name when the price is discounted. */
  inviter: string | null;
  /** The coupon's code when a coupon set the price (it replaces the referral discount). */
  coupon: string | null;
  /** The coupon or referral code to send with the order (the /r/ cookie, ?coupon=, or typed here). */
  code: string | null;
};

/**
 * For a signed-in buyer; use through SeasonPassButton, which knows her state and price. The button reads
 * "<verb> for ~~₹499~~ ₹159 with Rahul's invite" (struck: PLANS' display-only wasAmount), or "… ₹0 with coupon DRTARAL".
 * "Have a coupon or invite code?" shows until a coupon is applied; `initial` opens it with ?coupon='s code and its error.
 * A 100% coupon grants the pass with no Razorpay call.
 */
export function BuySeasonPass({ offer: initialOffer, verb, initial, className, noteClassName }: {
  offer: Offer; verb: string; initial?: { code: string; error: string | null }; className?: string; noteClassName?: string;
}) {
  const router = useRouter();
  const [paid, setPaid] = useState<string | null>(null);
  const [offer, setOffer] = useState(initialOffer);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initial?.error ?? null);
  const failed = useRef(false);
  const codeId = useId(); // the plan cards and a page's own button can both be on screen

  // One span, so the button's flex keeps it one line of text (wrapping as words, not as columns).
  const label = (
    <span>
      {verb} for {offer.amount < PLANS.season_pass.wasAmount && <s className="mr-1 opacity-70">{formatPaise(PLANS.season_pass.wasAmount)}</s>}
      {formatPaise(offer.amount)}
      {offer.inviter ? ` with ${offer.inviter}'s invite` : offer.coupon ? ` with coupon ${offer.coupon}` : ""}
    </span>
  );

  if (paid) return <p className={cn("text-sm font-semibold", noteClassName)} role="status">{paid}</p>;

  async function apply(form: FormData) {
    setMessage(null);
    const r = await applyCode(String(form.get("code") ?? ""));
    if (r.ok) setOffer((o) => ({ ...o, amount: r.amount, inviter: r.inviter, coupon: r.coupon, code: r.code }));
    else setMessage(r.error);
  }

  async function buy() {
    setBusy(true);
    setMessage(null);
    failed.current = false;
    try {
      // Only the code goes up: the server prices the order.
      const res = await fetch("/api/payments/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(offer.code ? { code: offer.code } : {}) });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return router.push(`/login?${new URLSearchParams({ next: NEXT })}`);
      if (res.status === 409) return setPaid("Season Pass active");
      if (body?.free) {
        setPaid(`Season Pass active — coupon ${body.coupon} applied`);
        navigating(true); // inside Decide: the shell keeps the refresh moving (decide-shell.tsx)
        return router.refresh();
      }
      if (!res.ok) {
        if (/^invalid_(referral|coupon)$/.test(body?.error?.code)) setOffer((o) => ({ ...o, amount: o.listAmount, inviter: null, coupon: null, code: null }));
        setBusy(false);
        return setMessage(body?.error?.message ?? "Couldn't start the payment. Try again.");
      }
      setOffer((o) => ({ ...o, amount: body.amount, inviter: body.inviter, coupon: body.coupon }));
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
        description: body.discount ? `Season Pass · ${formatPaise(body.discount)} off with ${body.coupon ? `coupon ${body.coupon}` : `${body.inviter}'s invite`}` : "Season Pass",
        // WhatsApp accounts: their number, so Razorpay doesn't ask for it.
        prefill: { email: body.email, ...(body.contact && { contact: `+${body.contact}` }) },
        theme: { color: "#0b0e12" },
        handler: (r: RazorpayResponse) => void confirm(r),
        modal: {
          ondismiss: () => {
            setBusy(false);
            if (failed.current) return;
            setMessage("Payment cancelled");
            beacon({ name: "checkout_cancelled" });
          },
        },
      });
      rzp.on("payment.failed", (r) => {
        failed.current = true;
        beacon({ name: "payment_failed" });
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
      setPaid("Season Pass active");
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
      <button type="button" data-upgrade="" onClick={buy} disabled={busy} className={cn("inline-flex items-center justify-center disabled:opacity-50", className)}>
        {busy ? "Opening payment…" : label}
      </button>
      {!offer.coupon && (
        <details open={!!initial} className={cn("mt-2 text-xs", noteClassName)}>
          <summary className="cursor-pointer">Have a coupon or invite code?</summary>
          {/* onSubmit, not action: a POST form dims the Decide shell until the address changes (nav-pending.tsx). */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void apply(new FormData(e.currentTarget));
            }}
            className="mt-1.5 flex gap-2"
          >
            <label htmlFor={codeId} className="sr-only">Coupon or invite code</label>
            <input id={codeId} name="code" required maxLength={20} defaultValue={initial?.code} autoComplete="off" spellCheck={false} placeholder="CODE" className="h-9 w-32 rounded-md border border-input bg-transparent px-2 text-sm uppercase text-foreground" />
            <button type="submit" className="h-9 rounded-md border border-input px-3 text-sm font-semibold text-foreground">Apply</button>
          </form>
        </details>
      )}
      {message && <p className={cn("mt-1 text-xs", noteClassName)} role="status">{message}</p>}
    </div>
  );
}
