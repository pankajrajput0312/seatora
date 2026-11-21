import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { cameFor } from "@/features/auth/lib/came-for";
import { PhoneLogin } from "@/features/auth/components/phone-login";
import { WhatsAppLogin } from "@/features/auth/components/whatsapp-login";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { phoneLoginOn } from "@/features/auth/lib/phone-login";
import { whatsappLoginOn } from "@/features/auth/lib/whatsapp-login";
import { openAccess, safeNext } from "@/lib/site-access";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const to = typeof next === "string" ? next : undefined;
  // Only a user who can already open Decide skips the form; anyone else (e.g. an expired access cookie) signs in again.
  if (await hasSiteAccess()) redirect(safeNext(to));
  // Sent here from a planner link (?next=): what it opens; new visitors have "New here? Create your account" under the form.
  const came = to ? cameFor(safeNext(to)) : null;
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in.">
      {came && <p className="mb-5 text-base leading-relaxed text-foreground">Sign in to see {came}.</p>}
      {error === "unavailable" && (
        <p role="alert" className="mb-6 rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
          The planner is unavailable right now. Please try again later.
        </p>
      )}
      <AuthForm mode="signin" next={to} open={openAccess()} />
      {phoneLoginOn() && <PhoneLogin next={safeNext(to)} />}
        {whatsappLoginOn() && <WhatsAppLogin next={safeNext(to)} />}
    </AuthShell>
  );
}
