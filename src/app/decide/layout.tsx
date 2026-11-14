import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { Suspense } from "react";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { AstryxProvider } from "@/features/decide/components/astryx-provider";
import { DecideShell } from "@/features/decide/components/decide-shell";
import { getMeta } from "@/features/decide/service";

// Inside app uses its own "case sheet" system (docs/APP_DESIGN_SYSTEM.md): light, hyperlegible numerals.
const app = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export const metadata: Metadata = { title: { default: "Decide", template: "%s · Decide · MEDPATH" } };

export default async function DecideLayout({ children }: { children: React.ReactNode }) {
  const meta = await getMeta();
  return (
    <div className={`app ${app.variable} min-h-screen`}>
      <AstryxProvider>
        <Suspense>
          <DecideShell meta={meta}>{children}</DecideShell>
        </Suspense>
      </AstryxProvider>
    </div>
  );
}
