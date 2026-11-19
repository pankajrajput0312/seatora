import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { cache } from "react";
import { staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { EmptyState } from "@/features/decide/components/ui";
import { getCatalog } from "@/features/decide/server/catalog";
import { seatLists } from "@/features/decide/server/seats";
import { examShows, roundNamesOf } from "./exam";
import { DEFAULT_EXAM, EXAM_COOKIE, examFor, exams, headYearIn, type Exam, type ExamKey } from "./registry";

/**
 * The exam Decide shows on this request: staff (OWNER, ADMIN) get the one they picked (the seatora_exam cookie, set only
 * for staff by app/decide/exam/route.ts); everyone else always NEET PG, whatever the cookie says. No account read
 * without a pick. Decide pages and their server components only: API v1, Ask and WhatsApp name no exam.
 */
export const activeExam = cache(async (): Promise<ExamKey> => {
  const asked = (await cookies()).get(EXAM_COOKIE)?.value;
  if (!asked || asked === DEFAULT_EXAM) return DEFAULT_EXAM;
  return examFor(asked, !!(await staffUser().catch(() => null)));
});

/**
 * The exam as its pages show it: its registry entry with what its data says. Another exam: `has.fees` (and bonds) once
 * its import has fee terms (a bundle with a fee table), its rounds' names as that year's MCC PDFs call them, and the
 * latest complete year (headlines). NEET PG: the registry's, exactly as before.
 */
export const examInfo = cache(async (exam: ExamKey): Promise<Exam> => {
  const E = exams[exam];
  if (exam === DEFAULT_EXAM) return E;
  const [cat, lists] = await Promise.all([getCatalog(exam), seatLists(exam)]);
  const fees = E.has.fees || cat.terms.length > 0;
  return { ...E, has: { ...E.has, fees, bonds: E.has.bonds || fees }, roundNames: roundNamesOf([...cat.sources, ...lists]), headYear: headYearIn(exam, cat.sources) };
});

/** What each gated page is called (the nav's words). */
const pageName: Record<string, string> = {
  "/decide/residents": "Residents",
  "/decide/seats": "Seats",
  "/decide/counselling": "Schedule",
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
