import type { Metadata } from "next";
import { Suspense } from "react";
import { DecideShell } from "@/features/decide/components/decide-shell";
import { getMeta } from "@/features/decide/service";

export const metadata: Metadata = { title: { default: "Decide", template: "%s · Decide · MEDPATH" } };

export default async function DecideLayout({ children }: { children: React.ReactNode }) {
  const meta = await getMeta();
  return (
    <Suspense>
      <DecideShell meta={meta}>{children}</DecideShell>
    </Suspense>
  );
}
