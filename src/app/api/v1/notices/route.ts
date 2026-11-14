import { handle, invalid, noticesQuerySchema, ok, parseQuery } from "@/features/decide/api";
import { getNotices } from "@/features/decide/service";

/** Counselling notices. Empty until announcements are imported from MCC; none are ever made up. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(noticesQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const notices = await getNotices();
    const data = q.data.kind ? notices.filter((n) => n.kind === q.data.kind) : notices;
    return ok(data, { sources: data.map((n) => ({ name: `${n.authority}: ${n.title}`, url: n.url })) });
  });
}
