import { afterAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "@/features/decide/server/catalog";
import { getOptionsByIds } from "@/features/decide/service";
import { decideDemoData as fx } from "@/features/decide/test/decide.demo";
import { optionId } from "@/features/decide/types";
import { liveReach } from "./actions";

vi.stubEnv("DATABASE_URL", "");
afterAll(() => setTestCatalog(null));

it("relabels saved choices from the current data, and validates what the browser sends", async () => {
  setTestCatalog(fx);
  const ids = [...new Set(fx.cutoffs.map(optionId))].slice(0, 3);
  const live = await liveReach([...ids, "no~such~option"], "rank=42284&cat=OBC");
  const rows = await getOptionsByIds(ids, { rank: 42284, category: "OBC", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null });
  // The fixture has no seat lists: no seat columns, and no seats per option.
  expect(live).toEqual({ lists: [], options: Object.fromEntries(rows.map((r) => [r.id, { reach: r.reach, provisional: r.reachProvisional, seats: {} }])) });
  expect(live!.options).not.toHaveProperty("no~such~option"); // unknown ids are left out, so the list can flag them
  expect(await liveReach(ids, "cat=OBC")).toBeNull(); // no rank, no labels
  expect(await liveReach(["x".repeat(301)], "rank=1")).toBeNull();
  expect(await liveReach("nope" as unknown as string[], "rank=1")).toBeNull();
  setTestCatalog(null);
  expect(await liveReach(ids, "rank=42284&cat=OBC")).toBeNull(); // no data: keep the stored labels
});
