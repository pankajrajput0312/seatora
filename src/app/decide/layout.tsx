import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { askUser } from "@/features/ask/access";
import { displayName } from "@/features/auth/lib/display-name";
import { getCurrentUser, staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { AstryxProvider } from "@/features/decide/components/astryx-provider";
import { DecideShell } from "@/features/decide/components/decide-shell";
import { NavPending } from "@/features/decide/components/nav-pending";
import type { ProfileMeta } from "@/features/decide/components/profile-dialog";
import { EmptyState } from "@/features/decide/components/ui";
import { nextChoiceFilling, RESULT_CLOSED_COOKIE, roundName, stepsNow } from "@/features/decide/lib/round-status";
import { roundStatus } from "@/features/decide/server/notices";
import { resultNews } from "@/features/decide/server/your-result";
import { isPhone } from "@/features/decide/server/view";
import { examGroupCourses, examGroups, getMeta } from "@/features/decide/service";
import { activeExam, examInfo } from "@/features/exams/active";
import { examShows } from "@/features/exams/exam";
import { authorityOf, DEFAULT_EXAM, examKeys, exams, pageNeeds, perGroup, sessionExams, yearName } from "@/features/exams/registry";
import { PlanCards } from "@/features/plans/components/plan-cards";
import { PlanPrompt } from "@/features/plans/components/plan-prompt";
import { freeNow, passState, planLine, shortDate } from "@/features/plans/plans";
import { PLAN_PROMPT_COOKIE, PLAN_PROMPT_EVERY_MS } from "@/features/plans/prompt";
import { db } from "@/lib/db";

// Inside app uses its own "case sheet" system (docs/APP_DESIGN_SYSTEM.md): light, hyperlegible numerals.
const app = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-app", display: "swap" });
// Stats and numbers only (font-mono, globals.css). Not preloaded: only a page that shows a stat fetches it.
const mono = Atkinson_Hyperlegible_Mono({ subsets: ["latin"], variable: "--font-app-mono", display: "swap", preload: false });

// Every Decide page reads profile params, so render on request. The shell is not suspended (its meta comes from the
// cached catalog); each route's loading.tsx streams a skeleton of its page inside it until the page's data is in. So a
// page's notFound() or redirect() now arrives after a 200 has started: the not-found view (noindex) or a client
// redirect, not a 404 / 307 status. The access redirect stays a real 307 (getMeta, here, before anything streams).
export const dynamic = "force-dynamic";

const title = { default: "Decide", template: "%s · Decide · Seatora" };
/** NEET PG's as ever (the site's description); another exam's (staff only) says what it is, never NEET PG's or MCC's words. */
export async function generateMetadata(): Promise<Metadata> {
  const exam = await activeExam();
  if (exam === DEFAULT_EXAM) return { title };
  const { label } = exams[exam];
  const description = `${label} counselling by ${authorityOf(exam)}: options for your ${label} rank, the seats on offer, closing ranks by ${sessionExams.includes(exam) ? "session" : "year"} and round, fees and bonds.`;
  return { title, description, openGraph: { title: `Seatora · ${label} planner`, description } };
}
export const viewport: Viewport = { themeColor: "#f3f6f9", viewportFit: "cover" }; // chart paper (--color-background inside .app)

/** Staff's exam switcher: every exam, with the pages it has no data for (the switcher opens Home instead). */
const examChoices = () =>
  Promise.all(examKeys.map(async (key) => { const E = await examInfo(key); return { key, label: E.label, lacks: Object.keys(pageNeeds).filter((href) => !examShows(E, href)) }; }));

export default async function DecideLayout({ children }: { children: React.ReactNode }) {
  // No database (or it is down): an honest "Data unavailable" inside the app shell, never stand-in data.
  let meta: ProfileMeta | null = null;
  // NEET PG for everyone but staff, who may pick another exam (features/exams/active.tsx).
  const exam = await activeExam();
  try {
    const m = await getMeta(exam);
    meta = { courses: m.courses, specialties: m.specialties, degrees: m.degrees, quotas: m.quotas, states: m.states, ...(perGroup(exam) && { groups: await examGroups(exam), groupCourses: await examGroupCourses(exam) }) };
  } catch (e) {
    unstable_rethrow(e); // the sign-in redirect when access is gone
    console.error("[decide] data unavailable", e);
  }
  // A phone's first paint already has the drawer layout (no sidebar column), so nothing shifts when the shell hydrates:
  // the width the shell measured last time, else the user agent's guess (globals.css keeps the column off a narrow window anyway).
  const phone = await isPhone();
  // Ask Seatora's nav entry: only for the owner while ASK_ENABLED=1 (no database read otherwise).
  const ask = !!meta && (await askUser().catch(() => null)) != null;
  // Her first choice list's name: the round she fills next (MCC's schedule, as Choices names it).
  const rs = meta ? await roundStatus(exams[exam].latestYear, exam).catch(() => null) : null;
  const fill = rs && nextChoiceFilling(stepsNow(rs, new Date()));
  // Another exam has no MCC schedule in the data: its first list is named for the exam, not a NEET PG round.
  const listName = fill ? `${roundName[fill.round]} · ${yearName(exam, rs.year)}` : exam === DEFAULT_EXAM ? null : `${exams[exam].label} list`;
  // The latest round's result while it is the newest news: the nav's entry, and the strip above every page unless she closed it.
  const result = meta ? await resultNews(exam).catch(() => null) : null;
  const resultStrip = !!result && decodeURIComponent((await cookies()).get(RESULT_CLOSED_COOKIE)?.value ?? "") !== result.id;
  // Admin's nav entry: only for an owner or admin.
  const admin = !!meta && (await staffUser().catch(() => null)) != null;
  // The sidebar's account footer and the header's plan chip: her name, her plan, and "Upgrade" without the Season Pass.
  const me = meta ? await getCurrentUser().catch(() => null) : null;
  const upgrade = !!me && ["claimable", "free"].includes(passState(me).state);
  const free = freeNow();
  const account = me && { name: displayName(me.name) || me.email.split("@")[0], plan: planLine(me), upgrade, freeTill: free && shortDate(free) };
  // The plan pop-up: right after signing in (the cookie createSession sets), only without the Season Pass, and at most
  // once in PLAN_PROMPT_EVERY_MS per account (her last plan_popup_shown, any device: a new phone's sign-in doesn't repeat it).
  const prompt =
    upgrade &&
    !!(await cookies()).get(PLAN_PROMPT_COOKIE) &&
    !(await db.funnelEvent.findFirst({ where: { userId: me!.id, name: "plan_popup_shown", at: { gte: new Date(Date.now() - PLAN_PROMPT_EVERY_MS) } }, select: { id: true } }).catch(() => null));
  return (
    <div className={`app ${app.variable} ${mono.variable} min-h-screen`}>
      <AstryxProvider>
        <DecideShell phone={phone} ask={ask} admin={admin} exam={admin ? await examInfo(exam) : undefined} choices={admin ? await examChoices() : undefined} account={account} listName={listName} result={result} resultStrip={resultStrip} meta={meta ?? { courses: [], specialties: [], degrees: [], quotas: [], states: [] }}>
          {meta ? (
            <NavPending>{children}</NavPending>
          ) : (
            <AppPage>
              <EmptyState
                headingLevel={1}
                icon={DatabaseZap}
                title="Data unavailable"
                description={`The ${authorityOf(exam)} allotment data could not be loaded, so nothing is shown rather than numbers that might be wrong. Reload the page in a few minutes.`}
                className="mt-6"
              />
            </AppPage>
          )}
        </DecideShell>
        {prompt && (
          <PlanPrompt title="Choose your plan">
            <p className="mt-1 text-sm text-muted-foreground">
              {free
                ? `You're on the Free plan. The Season Pass is free till ${shortDate(free)}: upgrade now, no card needed.`
                : "You're on the Free plan. The Season Pass lifts the daily limits for the whole counselling season."}
            </p>
            <PlanCards className="mt-4" />
          </PlanPrompt>
        )}
      </AstryxProvider>
    </div>
  );
}
