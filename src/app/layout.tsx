import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/config/site";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { VercelAnalytics } from "@/components/analytics/vercel-analytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} · NEET PG counselling planner`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  openGraph: { type: "website", siteName: siteConfig.name, title: `${siteConfig.name} · See the residents at every NEET PG hospital`, description: "77,000+ residents by hospital, course and year from MCC's official lists, plus options for your rank, seats, fees, stipend and bond. Free." },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0b0e12" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className="motion-safe:scroll-smooth">
      <body className="min-h-screen">
        {children}
        <InstallPrompt />
        <VercelAnalytics />
      </body>
    </html>
  );
}
