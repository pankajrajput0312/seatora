"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { savePayoutUpi } from "../actions";

/** Her UPI ID for referral payouts. Answers in place (a redirect back to the same page can stall the router). */
export function UpiForm({ upi }: { upi: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("upi") ?? "");
        start(async () => setMessage((await savePayoutUpi(value).catch(() => ({ message: "Couldn't save. Try again." }))).message));
      }}
      className="grid gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="upi-id" className="sr-only">UPI ID</label>
        <input id="upi-id" name="upi" required maxLength={100} defaultValue={upi ?? ""} placeholder="name@bank" autoComplete="off" spellCheck={false} className="h-11 w-64 max-w-full rounded-md border border-input bg-background px-3 text-sm" />
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      <p role="status" className="text-sm">{message}</p>
    </form>
  );
}
