import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffUser } from "@/features/auth/lib/session";
import { exams, type ExamKey } from "../registry";
import { landingWords } from "./words";

/**
 * Whether this visitor may see the exam's landing page: everyone when the exam is public (registry `public`), else staff
 * (OWNER, ADMIN) only. A public exam's check reads no cookie, so its page stays static.
 */
async function canSee(exam: ExamKey) {
  return exams[exam].public || !!(await staffUser().catch(() => null));
}

/** The page: for anyone else, the site's normal 404. */
export async function landingGate(exam: ExamKey) {
  if (!(await canSee(exam))) notFound();
}

/**
 * Its <head>, behind the same check: noindex until the exam is public. Anyone else gets the site's default head, so the
 * 404 carries nothing of the exam (and renders as any other 404: notFound() thrown here would not).
 */
export async function landingMetadata(exam: ExamKey): Promise<Metadata> {
  if (!(await canSee(exam))) return {};
  const { title, description } = landingWords[exam];
  return {
    title,
    description,
    alternates: { canonical: `/${exam}` },
    openGraph: { title, description, url: `/${exam}` },
    ...(!exams[exam].public && { robots: { index: false, follow: false } }),
  };
}
