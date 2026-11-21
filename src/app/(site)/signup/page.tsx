import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { priceLine } from "@/components/marketing/price-line";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { cameFor } from "@/features/auth/lib/came-for";
import { PhoneLogin } from "@/features/auth/components/phone-login";
import { WhatsAppLogin } from "@/features/auth/components/whatsapp-login";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { phoneLoginOn } from "@/features/auth/lib/phone-login";
import { whatsappLoginOn } from "@/features/auth/lib/whatsapp-login";
import { TrackView } from "@/features/funnel/components/beacon";
import { couponCodeSchema } from "@/features/payments/coupons";
import { CouponBanner } from "@/features/payments/components/season-pass-button";
import { couponCheck } from "@/features/payments/service";
import { InviteBanner } from "@/features/referrals/components/invite-banner";
import { REF_COOKIE } from "@/features/referrals/lib";
import { referrerByCode } from "@/features/referrals/service";
import { openAccess, safeNext } from "@/lib/site-access";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[]; ref?: string | string[]; invite?: string | string[]; coupon?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next, ref, invite, coupon: rawCoupon } = await searchParams;
  // A coupon (?coupon=, or inside ?next=): its banner here, and a good one lands her on the plan page to apply it.
  const nextCoupon = typeof next === "string" ? new URL(safeNext(next), "http://x").searchParams.get("coupon") : null;
  const coupon = couponCodeSchema.safeParse(typeof rawCoupon === "string" ? rawCoupon : nextCoupon).data ?? null;
  const banner = coupon ? await couponCheck(null, coupon) : null;
  const to = banner?.ok ? `/decide/plan?${new URLSearchParams({ coupon: coupon! })}` : typeof next === "string" ? next : undefined;
  if (await hasSiteAccess()) redirect(safeNext(to));
  // A referral (/r/CODE's cookie, else ?ref=): her inviter's first name, and sign-up records who invited her.
  const refCode = typeof ref === "string" ? ref : undefined;
  const inviter = await referrerByCode((await cookies()).get(REF_COOKIE)?.value ?? refCode);
  // What she came for (a Decide page, the Season Pass), said above the form so sign-up reads as the way there.
  const came = to ? cameFor(safeNext(to)) : null;
  const forWhat = came && <p className="mb-5 text-base leading-relaxed text-foreground">Create a free account to see {came}.</p>;
  if (openAccess()) {
    return (
      <AuthShell eyebrow="Free account" title="Create your account.">
        <TrackView name="signup_view" />
        {inviter && <InviteBanner inviter={inviter.name} className="mb-4" />}
        <CouponBanner b={banner} className="mb-4" />
        {/* /r/CODE with a code nobody has (route.ts), or a hand-typed ?ref= that isn't one. */}
        {!inviter && (invite === "bad" || refCode) && <p className="mb-4 text-sm text-muted-foreground">That invite link isn&apos;t valid. You can still create a free account.</p>}
        {forWhat}
        <p className="mb-6 text-sm text-muted-foreground max-sm:order-last max-sm:mt-6 max-sm:mb-0">{priceLine()}</p>
        <AuthForm mode="signup" next={to} open refCode={refCode} />
        {phoneLoginOn() && <PhoneLogin next={safeNext(to)} />}
        {whatsappLoginOn() && <WhatsAppLogin next={safeNext(to)} />}
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Season Pass" title="Create your account.">
      <TrackView name="signup_view" />
      {forWhat}
      <p className="mb-6 text-sm text-muted-foreground max-sm:order-last max-sm:mt-6 max-sm:mb-0">
        Accounts are created when you buy the Seatora NEET PG 2026 Season Pass from the <a href="/pricing" className="text-sky underline">Pricing</a>{" "}
        page; you receive an access code with your purchase.
      </p>
      <AuthForm mode="signup" next={to} />
    </AuthShell>
  );
}
