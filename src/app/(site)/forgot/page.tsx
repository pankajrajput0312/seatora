import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { AuthShell } from "@/features/auth/components/auth-shell";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

const link = "text-foreground underline hover:text-sky";

/**
 * There is no email provider: she writes from her account's email (or WhatsApp, NEXT_PUBLIC_CONTACT_WHATSAPP when set),
 * and the owner sends a one-time link made on /decide/admin.
 */
export default function ForgotPage() {
  const email = siteConfig.contactEmail;
  const whatsapp = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.replace(/[^\d+]/g, "");
  return (
    <AuthShell eyebrow="Forgot password" title="Reset your password.">
      <div className="grid gap-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          {email ? (
            <>Email us from your account email at <a href={`mailto:${email}?subject=${encodeURIComponent("Seatora password reset")}`} className={link}>{email}</a></>
          ) : (
            <>Write to us from your account email through the <Link href="/contact" className={link}>Contact</Link> page</>
          )}
          {whatsapp && <> (or WhatsApp <a href={`https://wa.me/${whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className={link}>{whatsapp}</a>)</>}
          , and we&apos;ll send you a reset link.
        </p>
        <p>The link works once, for an hour. It signs you out on every other device.</p>
        <p><Link href="/login" className={link}>Back to sign in</Link></p>
      </div>
    </AuthShell>
  );
}
