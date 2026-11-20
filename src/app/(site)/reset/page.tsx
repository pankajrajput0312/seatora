import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { resetAllowed, resetTokenUser } from "@/features/auth/lib/reset";

// The token is in the address: no referrer leaves this page, and it is never indexed.
export const metadata: Metadata = { title: "Set a new password", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** A one-time reset link from the admin page (/forgot explains how to ask for one). Views count against the IP's tries. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const t = typeof token === "string" && /^[\w-]{20,100}$/.test(token) ? token : null;
  const allowed = await resetAllowed();
  const user = allowed && t ? await resetTokenUser(t) : null;
  return (
    <AuthShell eyebrow="Password reset" title="Set a new password.">
      {user ? (
        <ResetPasswordForm token={t!} email={user.email} />
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          {allowed ? "This reset link has expired or was already used. Links work once, for an hour." : "Too many attempts. Please wait 15 minutes and open the link again."}{" "}
          <Link href="/forgot" className="text-sky underline">Ask for a new link</Link>.
        </p>
      )}
    </AuthShell>
  );
}
