import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { getCurrentUser } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in.">
      <AuthForm mode="signin" />
    </AuthShell>
  );
}
