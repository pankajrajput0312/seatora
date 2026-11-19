import { afterAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "@/features/decide/server/catalog";
import { getOptionsByIds } from "@/features/decide/service";
import { decideDemoData as fx } from "@/features/decide/test/decide.demo";
import { optionId } from "@/features/decide/types";
import { liveReach } from "./actions";

vi.stubEnv("DATABASE_URL", "");
vi.mock("@/features/exams/active", () => ({ activeExam: async () => "neet-pg" })); // no request here: no cookies
afterAll(() => setTestCatalog(null));

it("relabels saved choices from the current data, and validates what the browser sends", async () => {
  setTestCatalog(fx);
  const ids = [...new Set(fx.cutoffs.map(optionId))].slice(0, 3);
  const live = await liveReach([...ids, "no~such~option"], "rank=42284&cat=OBC");
  const rows = await getOptionsByIds(ids, { rank: 42284, category: "OBC", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null });
  // The fixture has no seat lists: no seat columns, and no seats per option. Each carries its terms for the stat cells.
  expect(live).toEqual({ lists: [], options: Object.fromEntries(rows.map((r) => [r.id, { reach: r.reach, provisional: r.reachProvisional, seats: {}, below: [], latest: r.latest, byYear: r.byYear, fees: r.fees, hospital: r.hospital ?? null }])) });
  expect(live!.options).not.toHaveProperty("no~such~option"); // unknown ids are left out, so the list can flag them
  // No rank: no labels, seat lists or seats, but the same terms and hospital (no closings: they are on her seat categories).
  expect(await liveReach(ids, "cat=OBC")).toEqual({ lists: [], options: Object.fromEntries(rows.map((r) => [r.id, { reach: null, provisional: false, seats: {}, below: [], latest: null, byYear: {}, fees: r.fees, hospital: r.hospital ?? null }])) });
  expect(await liveReach(["x".repeat(301)], "rank=1")).toBeNull();
  expect(await liveReach("nope" as unknown as string[], "rank=1")).toBeNull();
  setTestCatalog(null);
  expect(await liveReach(ids, "rank=42284&cat=OBC")).toBeNull(); // no data: keep the stored labels
});
