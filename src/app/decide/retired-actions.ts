"use server";

import { canUseDecide } from "@/features/auth/lib/session";
import { retiredKeys } from "@/features/decide/service";
import { activeExam } from "@/features/exams/active";

/**
 * Retired college keys → the college each is now, for the exam on show (staff's other exam: its own bundle's aliases,
 * e.g. NEET SS's re-keyed colleges). NEET PG's browsers keep /api/v1/retired-keys. Null without access.
 */
export async function examRetiredKeys() {
  if (!(await canUseDecide())) return null;
  return retiredKeys(await activeExam());
}
