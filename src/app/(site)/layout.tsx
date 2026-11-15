import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Public site: dark roook-style system (docs/DESIGN_SYSTEM.md). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // iOS zooms into fields under 16px, so on phones the text-sm inputs get text-base.
  return (
    <div className="scanlines flex min-h-screen flex-col max-md:[&_:is(input,select,textarea).text-sm]:text-base">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
