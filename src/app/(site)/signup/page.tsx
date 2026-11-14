import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { getCurrentUser } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <AuthShell eyebrow="Join MEDPATH" title="Create your account.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
