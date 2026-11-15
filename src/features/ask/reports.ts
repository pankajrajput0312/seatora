import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

// Plan reports written by create_report (tools.ts): a snapshot of the facts at the time, so the page renders without
// re-reading the data and prints the same tomorrow. Only the account that made one can open it (and only the owner can use Ask).

const s = z.string();
const n = s.nullable();
export const reportSchema = z.object({
  profile: z.object({ rank: z.number(), category: s, pwd: z.boolean(), courses: z.array(s) }),
  summary: s,
  choices: z.array(
    z.object({
      college: s, state: n, slug: s, course: s, quota: s, reach: s, lastClosing: n,
      seats: z.record(s, z.number()).nullable(), fee: s, stipend: s, bond: s, bondInr: s, leaving: s, reason: s,
    }),
  ),
  residents: z.array(z.object({ college: s, slug: s, residents: z.number() })),
  risks: z.array(s),
  sources: z.array(z.object({ name: s, url: n })),
});
export type ReportContent = z.infer<typeof reportSchema>;

export async function saveReport(userId: string, title: string, content: ReportContent) {
  const json = reportSchema.parse(content);
  return (await db.askReport.create({ data: { userId, title, json }, select: { id: true } })).id;
}

/** The report if it is this user's; null otherwise (a 404 either way). */
export async function getReport(id: string, userId: string) {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const r = await db.askReport.findUnique({ where: { id } });
  if (!r || r.userId !== userId) return null;
  const content = reportSchema.safeParse(r.json);
  return content.success ? { id: r.id, title: r.title, createdAt: r.createdAt, content: content.data } : null;
}
