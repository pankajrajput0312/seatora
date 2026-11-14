import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { safeNext } from "@/lib/site-access";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const to = typeof next === "string" ? next : undefined;
  if (await hasSiteAccess()) redirect(safeNext(to));
  return (
    <AuthShell eyebrow="Invite only" title="Create your account.">
      <p className="mb-6 text-sm text-muted-foreground">
        Seatora is invite-only for now. If you were invited, sign up with the email address your invite went to and the invite
        code you were given.
      </p>
      <AuthForm mode="signup" next={to} />
    </AuthShell>
  );
}
