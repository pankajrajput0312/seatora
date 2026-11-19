import "server-only";
import Link from "next/link";
import { headers } from "next/headers";
import { cache } from "react";
import { staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { EmptyState } from "@/features/decide/components/ui";
import { getCatalog } from "@/features/decide/server/catalog";
import { listNotices, scheduleYear } from "@/features/decide/server/notices";
import { seatLists } from "@/features/decide/server/seats";
import { examShows, roundNamesOf } from "./exam";
import { EXAM_HEADER } from "./keys";
import { DEFAULT_EXAM, examFor, exams, headYearIn, separateRankListOf, type Exam, type ExamKey } from "./registry";

/**
 * The exam Decide shows on this request: its URL's ?exam= (src/middleware.ts hands it over as a request header; none:
 * NEET PG), for staff (OWNER, ADMIN) only; everyone else always NEET PG, whatever the URL says (the middleware sends
 * them away from ?exam= anyway). No account read without one. Decide pages, their server components and actions only:
 * API v1, Ask and WhatsApp name no exam.
 */
export const activeExam = cache(async (): Promise<ExamKey> => {
  const asked = (await headers()).get(EXAM_HEADER);
  if (!asked || asked === DEFAULT_EXAM) return DEFAULT_EXAM;
  return examFor(asked, !!(await staffUser().catch(() => null)));
});

/**
 * The exam as its pages show it: its registry entry with what its data says. Another exam: `has.fees` (and bonds) once
 * its import has fee terms (a bundle with a fee table), `has.notices` once it has a round status or notices, its rounds' names as that year's MCC PDFs call them, and the
 * latest complete year (headlines). NEET PG: the registry's, exactly as before.
 */
export const examInfo = cache(async (exam: ExamKey): Promise<Exam> => {
  const E = exams[exam];
  if (exam === DEFAULT_EXAM) return E;
  const [cat, lists] = await Promise.all([getCatalog(exam), seatLists(exam)]);
  const fees = E.has.fees || cat.terms.length > 0;
  // Its round status and notices once its import has them (notices.json / round_status.json): Home's Today / Next strip.
  const notices = E.has.notices || (await scheduleYear(exam)) != null || (await listNotices({}, exam)).length > 0;
  return { ...E, has: { ...E.has, fees, bonds: E.has.bonds || fees, notices }, roundNames: roundNamesOf([...cat.sources, ...lists]), headYear: headYearIn(exam, cat.sources) };
});

/** What each gated page is called (the nav's words). */
const pageName: Record<string, string> = {
  "/decide/residents": "Residents",
  "/decide/seats": "Seats",
  "/decide/rank-tools": "Score & rank",
  "/decide/fees": "Fees & bond",
  "/decide/allotments": "Allotments",
  "/decide/rank-scan": "Rank scan",
  "/decide/rank-journey": "Rank journey",
};

/** The page in place of a Decide page the active exam has no data for (registry pageNeeds), else null. */
export async function examGate(href: string) {
  const exam = await activeExam();
  if (examShows(await examInfo(exam), href)) return null;
  const { label } = exams[exam];
  const name = pageName[href] ?? "This page";
  return (
    <AppPage>
      <EmptyState headingLevel={1} title={`${name} is not available for ${label}`} description={`Seatora has no ${label} data for ${name} yet. NEET PG has it.`} className="mt-6">
        <span className="flex flex-wrap justify-center gap-x-6">
          {/* A full load (the layout is the exam's): ?exam= goes through app/decide/exam/route.ts (staff only, as is any exam but NEET PG). */}
          <a href={`${href}?exam=${DEFAULT_EXAM}`} className="inline-flex min-h-11 items-center text-sm text-sky underline">Switch to {exams[DEFAULT_EXAM].label}</a>
          <Link href="/decide" className="inline-flex min-h-11 items-center text-sm text-sky underline">Go to Home</Link>
        </span>
      </EmptyState>
    </AppPage>
  );
}

/**
 * Which rank list a rank page reads, for an exam with two (INI-CET: MDS on its own, registry rankListIn), and a link to
 * the other: the same rank there is another candidate. `href(list)`: this page with ?list=.
 */
export function RankListNote({ exam, list, href }: { exam: ExamKey; list: string; href: (list: string) => string }) {
  const own = separateRankListOf(exam);
  if (!own) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{list ? `The ${own} rank list.` : `The rank list of every course but ${own}.`} {exams[exam].label} ranks {own} on a list of its own, so the same rank on the other list is another candidate.</span>
      <Link href={href(list ? "main" : own.toLowerCase())} className="inline-flex min-h-11 items-center text-sky underline">{list ? `Every course but ${own}` : `${own} rank list`}</Link>
    </p>
  );
}
