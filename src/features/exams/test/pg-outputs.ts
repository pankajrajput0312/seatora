// NEET PG outputs the multi-exam DB test compares (exams.db.test.ts): two fixed profiles through the service, seats,
// notices, merit and API v1, as JSON. Default exam only (no exam argument), so it reads what every NEET PG caller reads.
import { eligibleCategories } from "@/features/decide/lib/reach";
import { profileCourseFilter, type Profile } from "@/features/decide/profile";

const base = { pwd: false, degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
export const goldenProfiles: Record<string, Profile> = {
  obc: { ...base, rank: 44238, category: "OBC", specialties: ["ANAESTHESIOLOGY", "PAEDIATRICS"] },
  open: { ...base, rank: 5000, category: "Open", specialties: ["GENERALMEDICINE"] },
};
/** A college the neet-ss fixture shares with NEET PG (same key). */
export const SHARED_KEY = "SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM#400012";

const page = (n: number, size: number) => ({ page: n, pageSize: size });

export async function pgOutputs(): Promise<Record<string, unknown>> {
  const svc = await import("@/features/decide/service");
  const seats = await import("@/features/decide/server/seats");
  const notices = await import("@/features/decide/server/notices");
  const merit = await import("@/features/decide/server/merit");
  const { GET: optionsApi } = await import("@/app/api/v1/options/route");
  const out: Record<string, unknown> = {};
  const meta = await svc.getMeta();
  out.meta = meta;
  const shared = (await svc.getDecideData()).colleges.find((c) => c.key === SHARED_KEY)!;
  for (const [k, p] of Object.entries(goldenProfiles)) {
    const courses = meta.courses.filter((c) => p.specialties.includes(c.specialty));
    out[`${k}.options`] = await svc.listOptions(p, {}, page(1, 100));
    out[`${k}.optionsAll`] = await svc.listOptions(p, { view: "all" }, page(2, 50));
    out[`${k}.lastRanks`] = await svc.lastRanks({ courses, category: p.category }, page(1, 100));
    out[`${k}.allotments`] = await svc.listAllotments({ year: 2025, courses: courses.map((c) => c.slug) }, page(1, 100));
    out[`${k}.dashboard`] = await svc.dashboard(p);
    out[`${k}.institutes`] = await svc.listInstitutes(p, {}, page(1, 100));
    out[`${k}.institute`] = await svc.getInstitute(shared.slug, p);
    out[`${k}.seats`] = await seats.listSeats({ ...profileCourseFilter(p), categories: eligibleCategories(p.category, p.pwd) }, page(1, 200));
    out[`${k}.rankScan`] = await svc.rankScan(p.rank, 2025, 50);
    out[`${k}.rankJourney`] = await svc.rankJourney(2025, p.rank);
    const qs = new URLSearchParams([["rank", String(p.rank)], ["cat", p.category], ...p.specialties.map((s) => ["sp", s])]);
    out[`${k}.api`] = await (await optionsApi(new Request(`http://x/api/v1/options?${qs}&pageSize=25`))).json();
  }
  out.trends = await svc.allotmentTrends({ specialty: "ANAESTHESIOLOGY" }, page(1, 100));
  out.fees = await svc.listFees({}, page(1, 100));
  out.seatLists = await seats.seatLists();
  out.roundStatus = await notices.roundStatus(2026);
  out.notices = await notices.listNotices();
  out.meritLists = await merit.meritLists();
  out.scoreToRank = await merit.scoreToRank(2025, 500);
  out.meritPosition = await merit.meritPosition(2025, "OBC", 44238);
  return JSON.parse(JSON.stringify(out));
}
