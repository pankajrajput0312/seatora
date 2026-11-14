import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";

// Second home page: the inside app's light "case sheet" system (docs/APP_DESIGN_SYSTEM.md), not the dark site theme.
const app = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export const metadata: Metadata = {
  title: "MEDPATH · Your NEET PG rank, turned into a plan",
  robots: { index: false }, // alternative home page while both versions are compared
};

export default function HomeV2Layout({ children }: { children: React.ReactNode }) {
  return <div className={`app ${app.variable} min-h-screen bg-card`}>{children}</div>;
}
