import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { EmptyState } from "@/features/decide/components/ui";
import { DEFAULT_EXAM, EXAM_COOKIE, examFor, exams, showsPage, type ExamKey } from "./registry";

/**
 * The exam Decide shows on this request: staff (OWNER, ADMIN) get the one they picked (the seatora_exam cookie: the
 * header's switcher, or ?exam= via src/middleware.ts); everyone else always NEET PG, whatever the cookie says. No
 * account read without a pick. Decide pages and their server components only: API v1, Ask and WhatsApp name no exam.
 */
export const activeExam = cache(async (): Promise<ExamKey> => {
  const asked = (await cookies()).get(EXAM_COOKIE)?.value;
  if (!asked || asked === DEFAULT_EXAM) return DEFAULT_EXAM;
  return examFor(asked, !!(await staffUser().catch(() => null)));
});

/** The page in place of a Decide page the active exam has no data for (registry pageNeeds), else null. */
export async function examGate(href: string) {
  const exam = await activeExam();
  if (showsPage(exam, href)) return null;
  return (
    <AppPage>
      <EmptyState headingLevel={1} title={`Not available for ${exams[exam].label}`} description={`Seatora has no ${exams[exam].label} data for this page yet.`} className="mt-6" />
    </AppPage>
  );
}
