// Exam keys. No imports: prisma/import-mcc.ts, prisma/snapshot.ts and src/middleware.ts load this too. The rest of an
// exam (label, years, has…) is in ./registry.ts.

/** The switcher's order. NEET PG's import writes its colleges' fields; another exam's only the ones no other exam has. */
export const examKeys = ["neet-pg", "neet-ss", "neet-mds"] as const;
export type ExamKey = (typeof examKeys)[number];
export const DEFAULT_EXAM: ExamKey = "neet-pg";
export const isExam = (s: unknown): s is ExamKey => examKeys.includes(s as ExamKey);

/** Exams whose ranks are per question group (the group rides in the quota label): a candidate is a rank within a quota. */
export const ranksPerGroup: readonly ExamKey[] = ["neet-ss"];

/**
 * Set by app/decide/exam/route.ts for staff only (their last exam): a browser that has it may carry ?exam= past the
 * middleware (src/middleware.ts); one without it is sent through that route first. Never read for the exam itself.
 */
export const EXAM_COOKIE = "seatora_exam";
/** The request's exam as its URL names it (?exam=), put on the request by src/middleware.ts (features/exams/active.tsx reads it). */
export const EXAM_HEADER = "x-seatora-exam";
export const examCookie = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/decide", maxAge: 60 * 60 * 24 * 365 });

/** The data-version marker an import writes last (server/catalog.ts dataVersion); NEET PG keeps its old key. */
export const markerKey = (exam: ExamKey) => (exam === DEFAULT_EXAM ? "import/mcc" : `import/${exam}`);

/**
 * A per-exam storage key (localStorage, sessionStorage, the account's synced json): NEET PG keeps today's key exactly,
 * another exam gets its own ("medpath.profile.neet-mds"), so no exam ever reads or overwrites another's.
 */
export const scopedKey = (key: string, exam: ExamKey) => (exam === DEFAULT_EXAM ? key : `${key}.${exam}`);
