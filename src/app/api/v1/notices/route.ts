import { z } from "zod";
import { handle, invalid, ok, parseQuery } from "@/features/decide/api";
import { listNotices } from "@/features/decide/server/notices";
import { noticeKinds } from "@/features/decide/types";

const querySchema = z.object({
  kind: z.enum(noticeKinds).optional(),
  round: z.enum(["R1", "R2", "R3", "stray"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

/** MCC notices imported from MCC, newest first; filters `kind`, `round`, `year` (counselling year). Each is its own source. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(querySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const data = await listNotices(q.data);
    return ok(data, { sources: data.map((n) => ({ name: `${n.authority}: ${n.title} (${n.date})`, url: n.url })) });
  });
}
