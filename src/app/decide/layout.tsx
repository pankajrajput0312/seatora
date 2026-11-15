import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { askUser } from "@/features/ask/access";
import { AppPage } from "@/features/decide/components/app-page";
import { AstryxProvider } from "@/features/decide/components/astryx-provider";
import { DecideShell } from "@/features/decide/components/decide-shell";
import { NavPending } from "@/features/decide/components/nav-pending";
import type { ProfileMeta } from "@/features/decide/components/profile-dialog";
import { EmptyState } from "@/features/decide/components/ui";
import { deviceView } from "@/features/decide/components/view-toggle";
import { getMeta } from "@/features/decide/service";

// Inside app uses its own "case sheet" system (docs/APP_DESIGN_SYSTEM.md): light, hyperlegible numerals.
const app = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-app", display: "swap" });

// Every Decide page reads profile params, so render on request. The shell is not suspended (its meta comes from the
// cached catalog); each route's loading.tsx streams a skeleton of its page inside it until the page's data is in. So a
// page's notFound() or redirect() now arrives after a 200 has started: the not-found view (noindex) or a client
// redirect, not a 404 / 307 status. The access redirect stays a real 307 (getMeta, here, before anything streams).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { default: "Decide", template: "%s · Decide · Seatora" } };
export const viewport: Viewport = { themeColor: "#f3f6f9", viewportFit: "cover" }; // chart paper (--color-background inside .app)

export default async function DecideLayout({ children }: { children: React.ReactNode }) {
  // No database (or it is down): an honest "Data unavailable" inside the app shell, never stand-in data.
  let meta: ProfileMeta | null = null;
  try {
    const m = await getMeta();
    meta = { courses: m.courses, specialties: m.specialties, degrees: m.degrees, quotas: m.quotas, states: m.states };
  } catch (e) {
    unstable_rethrow(e); // the sign-in redirect when access is gone
    console.error("[decide] data unavailable", e);
  }
  // A phone's first paint already has the drawer layout (no sidebar column), so nothing shifts when the shell hydrates.
  const h = await headers();
  const phone = deviceView(h.get("user-agent"), h.get("sec-ch-ua-mobile")) === "cards";
  // Ask Seatora's nav entry: only for the owner while ASK_ENABLED=1 (no database read otherwise).
  const ask = !!meta && (await askUser().catch(() => null)) != null;
  return (
    <div className={`app ${app.variable} min-h-screen`}>
      <AstryxProvider>
        <DecideShell phone={phone} ask={ask} meta={meta ?? { courses: [], specialties: [], degrees: [], quotas: [], states: [] }}>
          {meta ? (
            <NavPending>{children}</NavPending>
          ) : (
            <AppPage>
              <EmptyState
                headingLevel={1}
                icon={DatabaseZap}
                title="Data unavailable"
                description="The MCC allotment data could not be loaded, so nothing is shown rather than numbers that might be wrong. Reload the page in a few minutes."
                className="mt-6"
              />
            </AppPage>
          )}
        </DecideShell>
      </AstryxProvider>
    </div>
  );
}
