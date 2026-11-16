import { cn } from "@/lib/cn";
import { REFERRAL_PERCENT } from "../lib";

/** "Rahul invited you — 20% off the Season Pass" on sign-up and Pricing. The referrer's first name only, never her email. */
export function InviteBanner({ inviter, className }: { inviter: string; className?: string }) {
  return (
    <p className={cn("rounded-md border border-sky/40 bg-sky/10 px-3 py-2 text-sm text-foreground", className)}>
      <span className="font-semibold">{inviter} invited you</span> — {REFERRAL_PERCENT}% off the Season Pass
    </p>
  );
}
