import { IBM_Plex_Sans } from "next/font/google";
import { Container } from "@/components/layout/container";

// Sign in, sign up and the password pages are the doorway to the planner, so they wear its look (docs/APP_DESIGN_SYSTEM.md,
// the `.app` tokens and IBM Plex Sans, as src/app/decide/layout.tsx) inside the site's header and footer: one white sheet
// on the pale page, the form first at every width. `.app` also paints the whole page light (html:has(.app), globals.css),
// so the html keeps the site's dark page and scheme here: the header and footer read as on every other site page.
const app = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-app", display: "swap" });

export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className={`app ${app.variable} [html:has(&)]:scheme-dark [html:has(&)]:bg-background`}>
      <Container className="grid min-h-[calc(100dvh-4rem)] content-start justify-items-center py-6 sm:py-12 lg:content-center">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 sm:p-8">
          <p className="section-label text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-h1 font-semibold">{title}</h1>
          <div className="mt-6 flex flex-col">{children}</div>
        </div>
      </Container>
    </section>
  );
}
