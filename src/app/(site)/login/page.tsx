import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { safeNext } from "@/lib/site-access";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const to = typeof next === "string" ? next : undefined;
  // Only a user who can already open Decide skips the form; anyone else (e.g. an expired access cookie) signs in again.
  if (await hasSiteAccess()) redirect(safeNext(to));
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in.">
      {error === "unavailable" && (
        <p role="alert" className="mb-6 rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
          The planner is unavailable right now. Please try again later.
        </p>
      )}
      <AuthForm mode="signin" next={to} />
    </AuthShell>
  );
}
