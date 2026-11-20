import "server-only";
import { Prisma } from "@prisma/client";
import { quotaIn } from "@/features/exams/exam";
import { authorityOf, DEFAULT_EXAM, exams, latestOf, perGroup, rankListIn, rankListOf, type ExamKey } from "@/features/exams/registry";
import { db } from "@/lib/db";
import { heldParts } from "../lib/held";
import { roundName } from "../lib/round-status";
import { yourResult, type ResultWords } from "../lib/your-result";
import { profileHasCourse, profileSchema, type Profile } from "../profile";
import { getDecideData, getMeta, rankJourney } from "../service";
import { scheduleYear } from "./notices";

// "Your Round 2 result" (lib/your-result.ts): her saved or tried rank in the latest round's result (Home, Ask), and the
// owner's list of every saved rank in it (Admin). Ranks and seats only, from MCC's PDFs; a member sees only her own rank's.

/**
 * The latest round with a result (lib/reach.ts latestRound), its result PDF and the exam's words, while it is a later
 * round (R2, R3, a stray round) of the year counselling is on; null otherwise (Round 1 only, or a past year's: no card).
 */
async function resultRound(exam: ExamKey) {
  const meta = await getMeta(exam);
  const latest = latestOf(meta.sources, exam);
  if (latest.round === "R1" || latest.year !== (await scheduleYear(exam))) return null;
  const E = exams[exam];
  const words: ResultWords = { rankWord: E.rankWord, by: authorityOf(exam), round: latest.round, roundName: (r) => E.roundWords?.[r] ?? roundName[r], provisional: latest.provisional, quota: (q) => quotaIn(E, q) };
  return { meta, latest, words, pdf: meta.sources.find((s) => s.year === latest.year && s.round === latest.round && s.url) ?? null };
}

/** Her rank's rows that year (NEET SS: in her question group; INI-CET: on her courses' rank list) and what they say; null while there is no later round's result. */
export async function rankResult(profile: Profile, exam: ExamKey = DEFAULT_EXAM) {
  const r = await resultRound(exam);
  if (!r) return null;
  const group = perGroup(exam) && profile.quotas.length ? profile.quotas : undefined;
  const list = rankListIn(exam, null, r.meta.courses.filter((c) => profileHasCourse(profile, c)).map((c) => c.degree));
  const rows = (await rankJourney(r.latest.year, profile.rank, exam, group)).filter((a) => list == null || rankListOf(exam, a.degree) === list);
  let heldName: string | null = null;
  if (profile.held) {
    const h = heldParts(profile.held);
    const d = await getDecideData(exam);
    const course = d.courses.find((c) => c.degree === h.degree && c.specialty === h.specialty);
    heldName = `${h.degree} ${course?.name ?? h.specialty}, ${d.colleges.find((c) => c.key === h.college)?.name ?? h.college}`;
  }
  return { ...r, rows, result: yourResult(profile, rows, { ...r.words, heldName }) };
}

const savedSchema = profileSchema.pick({ rank: true, category: true, pwd: true, quotas: true, held: true });

/**
 * Admin: every account's saved rank (UserProfile, the exam's part) in the latest round's result, by user id only. Only
 * the few profile fields it needs leave the database. Null while there is no later round's result.
 */
export async function savedRankResults(exam: ExamKey = DEFAULT_EXAM) {
  const r = await resultRound(exam);
  if (!r) return null;
  const at = exam === DEFAULT_EXAM ? Prisma.sql`json` : Prisma.sql`(json -> ${exam})`;
  const raw = await db.$queryRaw<{ userId: string; p: unknown }[]>`
    SELECT "userId", jsonb_strip_nulls(jsonb_build_object('rank', ${at} -> 'rank', 'category', ${at} -> 'category', 'pwd', ${at} -> 'pwd', 'quotas', ${at} -> 'quotas', 'held', ${at} -> 'held')) AS p
    FROM "UserProfile" WHERE ${at} -> 'rank' IS NOT NULL`;
  const saved = raw.flatMap((u) => {
    const p = savedSchema.safeParse(u.p);
    return p.success ? [{ userId: u.userId, profile: p.data }] : [];
  });
  const rows = Map.groupBy(await rankJourney(r.latest.year, [...new Set(saved.map((s) => s.profile.rank))], exam), (a) => a.rank);
  const users = saved.map(({ userId, profile }) => {
    const group = perGroup(exam) && profile.quotas.length ? profile.quotas : null;
    const mine = (rows.get(profile.rank) ?? []).filter((a) => !group || group.includes(a.quota));
    return { userId, profile, result: yourResult(profile, mine, r.words) };
  });
  return { latest: r.latest, words: r.words, pdf: r.pdf, users };
}
