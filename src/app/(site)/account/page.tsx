import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { PixelEmblem } from "@/components/marketing/pixel-emblem";
import { signOut } from "@/features/auth/actions";
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

      <div className="grid place-items-center py-24 text-center">
        <PixelEmblem className="bob w-28 opacity-60" />
        <h2 className="mt-8 text-lg font-medium">Nothing here yet.</h2>
      </div>
    </Container>
  );
}
