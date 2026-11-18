// Exam keys. No imports: prisma/import-mcc.ts, prisma/snapshot.ts and src/middleware.ts load this too. The rest of an
// exam (label, years, has…) is in ./registry.ts.

/** The switcher's order. NEET PG's import writes its colleges' fields; another exam's only creates the ones it is first to have. */
export const examKeys = ["neet-pg", "neet-ss", "neet-mds"] as const;
export type ExamKey = (typeof examKeys)[number];
export const DEFAULT_EXAM: ExamKey = "neet-pg";
export const isExam = (s: unknown): s is ExamKey => examKeys.includes(s as ExamKey);

/** Exams whose ranks are per question group (the group rides in the quota label): a candidate is a rank within a quota. */
export const ranksPerGroup: readonly ExamKey[] = ["neet-ss"];

/** Staff's pick of exam (?exam= sets it, src/middleware.ts); ignored for everyone else (server/active.tsx). */
export const EXAM_COOKIE = "seatora_exam";

/** The data-version marker an import writes last (server/catalog.ts dataVersion); NEET PG keeps its old key. */
export const markerKey = (exam: ExamKey) => (exam === DEFAULT_EXAM ? "import/mcc" : `import/${exam}`);
