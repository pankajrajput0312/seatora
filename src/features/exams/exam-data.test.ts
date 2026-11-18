import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/features/decide/profile";
import { setTestCatalog } from "@/features/decide/server/catalog";
import type { Allotment, Cutoff, DecideData, Round } from "@/features/decide/types";

// NEET SS on the service, from a synthetic in-memory catalog (no database): a rank is within one question group, which
// rides in the quota label, so labels, rank scan and rank journey compare it only with her group's seats.
vi.stubEnv("DATABASE_URL", "");
let svc: typeof import("@/features/decide/service");
beforeAll(async () => {
  svc = await import("@/features/decide/service");
});
afterAll(() => setTestCatalog(null));

const MED = "All India (Medical Group)";
const SURG = "All India (Surgical Group)";
const A = "SSEXAMPLEINSTITUTEA#110001";
const B = "SSEXAMPLEINSTITUTEB#600001";
const cut = (college: string, degree: string, specialty: string, year: number, round: Round, quota: string, closing: number): Cutoff => ({ college, degree, specialty, year, round, quota, category: "Open", opening: 1, closing, n: 1, src: `${year}/${round}` });
const allot = (rank: number, college: string, degree: string, specialty: string, quota: string, round: Round = "R1"): Allotment => ({ rank, category: "Open", college, degree, specialty, year: 2025, round, quota, remark: "Allotted", status: "allotted", candidateCategory: null, optionNo: null, prev: null });
const data: DecideData = {
  colleges: [A, B].map((key, i) => ({ key, slug: `ss-example-${i}`, name: `SS Example Institute ${"AB"[i]}`, state: "Delhi", pincode: null, address: null, type: null, beds: null, established: null, website: null })),
  courses: [
    { degree: "DM", specialty: "CARDIOLOGY", name: "Cardiology", slug: "dm-cardiology" },
    { degree: "MCh", specialty: "NEUROSURGERY", name: "Neuro Surgery", slug: "mch-neuro-surgery" },
  ],
  sources: ([[2023, "R1"], [2024, "R1"], [2025, "R1"], [2025, "R2"], [2025, "special_stray"]] as const).map(([year, round]) => ({ key: `${year}/${round}`, url: null, year, round, provisional: false, name: `MCC NEET SS ${year} ${round} allotment result (final)` })),
  cutoffs: [
    cut(A, "DM", "CARDIOLOGY", 2024, "R1", MED, 300),
    cut(A, "DM", "CARDIOLOGY", 2025, "R1", MED, 250),
    cut(B, "MCh", "NEUROSURGERY", 2024, "R1", SURG, 80),
    cut(B, "MCh", "NEUROSURGERY", 2025, "R1", SURG, 90),
  ],
  terms: [],
  allotments: [allot(100, A, "DM", "CARDIOLOGY", MED), allot(100, B, "MCh", "NEUROSURGERY", SURG), allot(250, A, "DM", "CARDIOLOGY", MED)],
};
const base: Profile = { rank: 200, category: "Open", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
const medical: Profile = { ...base, quotas: [MED] };

describe("NEET SS: group-aware reach", () => {
  beforeAll(() => setTestCatalog(data, "neet-ss"));

  it("labels only her question group's options, from SS years (2023 to 2025)", async () => {
    const r = await svc.listOptions(medical, { view: "all" }, undefined, "neet-ss");
    expect(r.rows.map((x) => [x.quota, x.reach])).toEqual([[MED, "reached-latest"]]); // 2025 R1 closed at 250, after 200
    expect(Object.keys(r.rows[0].byYear)).toEqual(["2023", "2024", "2025"]);
    expect(r.rows[0].latest?.closing).toBe(250);
  });

  it("no group picked: no option is compared with her rank", async () => {
    const r = await svc.listOptions(base, { view: "all" }, undefined, "neet-ss");
    expect(r.total).toBe(0);
    const d = await svc.dashboard(base, "neet-ss");
    expect(d.total).toBe(0);
  });

  it("another group's same rank is another candidate: rank scan and journey keep to her group", async () => {
    const all = (await svc.rankScan(100, 2025, 10, "neet-ss")).flatMap((g) => g.rows).map((a) => a.quota);
    const mine = (await svc.rankScan(100, 2025, 10, "neet-ss", medical.quotas)).flatMap((g) => g.rows).map((a) => a.quota);
    expect(all.sort()).toEqual([MED, SURG]);
    expect(mine).toEqual([MED]);
    expect((await svc.rankJourney(2025, 100, "neet-ss", medical.quotas)).map((a) => a.collegeName)).toEqual(["SS Example Institute A"]);
  });

  it("another group's option on an institute or in Compare: shown, never labelled with her rank", async () => {
    const inst = await svc.getInstitute("ss-example-1", medical, "neet-ss");
    expect(inst!.options.map((o) => [o.quota, o.reach, o.otherGroup])).toEqual([[SURG, "no-data", true]]);
    const rows = await svc.getOptionsByIds([`${A}~DM~CARDIOLOGY~${MED}`, `${B}~MCh~NEUROSURGERY~${SURG}`], medical, "neet-ss");
    expect(rows.map((r) => [r.reach, r.otherGroup ?? false])).toEqual([["reached-latest", false], ["no-data", true]]);
  });

  it("the institute list's best label is her group's", async () => {
    const r = await svc.listInstitutes(medical, {}, undefined, "neet-ss");
    expect(r.rows.map((x) => [x.college.key, x.bestReach])).toEqual([[A, "reached-latest"], [B, "no-data"]]);
  });

  it("her groups are the latest year's (the group system she sits)", async () => {
    expect(await svc.examGroups("neet-ss")).toEqual(["Medical Group", "Surgical Group"]);
    expect(await svc.examGroups("neet-pg")).toEqual([]);
  });

  it("the round trend has the exam's own rounds (no R3 in NEET SS)", async () => {
    const d = await svc.dashboard(medical, "neet-ss");
    expect(d.trend[0].points.map((p) => p.round)).toEqual(["R1", "R2", "stray"]);
  });
});
