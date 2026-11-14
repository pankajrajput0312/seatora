import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getCurrentUser } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <Container className="py-16 md:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{user.email}</p>
          <h1 className="glow mt-3 font-pixel text-4xl leading-none md:text-5xl">Hi, {user.name}.</h1>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </div>

      <section aria-labelledby="password-h" className="max-w-sm py-12">
        <h2 id="password-h" className="text-lg font-medium">Change password</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">This signs you out on every other device.</p>
        <ChangePasswordForm email={user.email} />
      </section>
    </Container>
  );
}
