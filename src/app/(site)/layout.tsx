import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Public site: dark roook-style system (docs/DESIGN_SYSTEM.md). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="scanlines flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
