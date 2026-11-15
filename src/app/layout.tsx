import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel/square"; // not "geist/font/pixel": that preloads all five pixel faces
import { siteConfig } from "@/config/site";
import { InstallPrompt } from "@/components/pwa/install-prompt";
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
    <html lang="en-IN" className={`motion-safe:scroll-smooth ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}>
      <body className="min-h-screen">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
