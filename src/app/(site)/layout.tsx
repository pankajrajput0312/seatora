import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteFonts } from "@/app/site-fonts";

// Every static public page re-renders at least hourly, so a price line read at build (the policy pages' SeasonPassPrice:
// "Full access free until 23:59 IST, 20 Nov 2026…") turns over within an hour of FREE_FOR_ALL_UNTIL, as the home page does.
// Without it those pages are prerendered once and say the free period is on until the next deploy.
export const revalidate = 3600;

/** Public site: dark roook-style system (docs/DESIGN_SYSTEM.md). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // iOS zooms into fields under 16px, so on phones the text-sm inputs get text-base.
  return (
    <div className={`${siteFonts} scanlines flex min-h-screen flex-col max-md:[&_:is(input,select,textarea).text-sm]:text-base`}>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
