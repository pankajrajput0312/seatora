import "server-only";
import { db } from "@/lib/db";
import { rounds, roundSteps, type MccNotice, type NoticeKind, type Round, type RoundStepInfo, type RoundStepName, type StepStatus } from "../types";
import { perImport } from "./catalog";

// MCC notices (Announcement) and the round steps derived only from them (RoundStep), as prisma/import-mcc.ts loads
// notices.json and round_status.json. Each notice is its own official source (title, date, link).

const day = (d: Date) => d.toISOString().slice(0, 10);

/** MCC notices, newest first. Filters: notices.json kind, round (R1, R2, R3, stray), counselling year. */
export const listNotices = (f: { kind?: NoticeKind; round?: Round; year?: number } = {}) => noticesOnce(JSON.stringify([f.kind, f.round, f.year]));

const noticesOnce = perImport(async (key): Promise<MccNotice[]> => {
  const [kind, round, year] = JSON.parse(key) as [NoticeKind?, Round?, number?];
  const f = { kind: kind ?? undefined, round: round ?? undefined, year: year ?? undefined };
  const rows = await db.announcement.findMany({
    where: { category: f.kind, round: f.round, counsellingYear: f.year },
    select: { title: true, authority: true, category: true, counsellingYear: true, round: true, publishedAt: true, officialUrl: true },
    orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
  });
  return rows.map((r) => ({ title: r.title, date: day(r.publishedAt), url: r.officialUrl, authority: r.authority, kind: r.category as NoticeKind, year: r.counsellingYear, round: r.round as Round | null }));
});

export type RoundStatus = {
  year: number;
  /** When the notices were read (ISO): every status is as of then. */
  asOf: string;
  rounds: { round: Round; steps: RoundStepInfo[] }[];
};

/** Round steps of a counselling year, R1 → stray, each seat matrix → final result. Null when none are imported. */
export const roundStatus = (year: number) => roundStatusOnce(String(year));

const roundStatusOnce = perImport(async (key): Promise<RoundStatus | null> => {
  const year = Number(key);
  const [rows, schedules] = await Promise.all([
    db.roundStep.findMany({ where: { year } }),
    db.announcement.findMany({ where: { category: "schedule", counsellingYear: year, officialUrl: { not: null } }, select: { title: true, officialUrl: true, round: true }, orderBy: { publishedAt: "desc" } }),
  ]);
  if (!rows.length) return null;
  // Where a step's dates are printed: its own notice when that is a schedule, else the newest schedule of its round, else of the year.
  const scheduleOf = (round: string, url: string | null) => {
    const s = schedules.find((n) => n.officialUrl === url) ?? schedules.find((n) => n.round === round) ?? schedules.find((n) => n.round == null);
    return s ? { url: s.officialUrl!, title: s.title } : null;
  };
  const out = new Map<Round, RoundStepInfo[]>();
  for (const r of rows) {
    const scheduled = r.scheduledFrom || r.scheduledTo || r.scheduledOn ? { from: r.scheduledFrom, to: r.scheduledTo, on: r.scheduledOn, tentative: r.tentative } : null;
    const step: RoundStepInfo = {
      step: r.step as RoundStepName,
      status: r.status as StepStatus,
      date: r.date,
      url: r.url,
      title: r.title,
      note: r.note,
      scheduled,
      scheduledBy: scheduled && scheduleOf(r.round, r.url),
      events: r.events as RoundStepInfo["events"],
    };
    (out.get(r.round as Round) ?? out.set(r.round as Round, []).get(r.round as Round)!).push(step);
  }
  return {
    year,
    asOf: rows[0].asOf.toISOString(),
    rounds: [...out]
      .sort(([a], [b]) => rounds.indexOf(a) - rounds.indexOf(b))
      .map(([round, steps]) => ({ round, steps: steps.sort((a, b) => roundSteps.indexOf(a.step) - roundSteps.indexOf(b.step)) })),
  };
});
