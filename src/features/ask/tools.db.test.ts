import { describe, expect, it, vi } from "vitest";

// The tools on the real MCC import (local DATABASE_URL exported; skipped otherwise): her profile, AIR 42,284 OBC,
// Anaesthesiology and Family Medicine. Shapes and a few spot values; the numbers are the pages' own.
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("tools on the real import", async () => {
  const { profileFromParams } = await import("@/features/decide/profile");
  const { runTool } = await import("./tools");
  const ctx = { userId: "nobody", profile: profileFromParams(new URLSearchParams("rank=42284&cat=OBC&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE")) };
  const run = async (name: string, input: object) => {
    const r = await runTool(name, input, ctx, 15_000);
    if (!r.ok) throw new Error(r.error);
    return r.data as Record<string, unknown> & { rows?: Record<string, unknown>[] };
  };

  it("get_profile and search_options read her profile, capped at 25 rows with links", async () => {
    expect(await run("get_profile", {})).toMatchObject({ rank: 42284, category: "OBC", courses: ["Anaesthesiology", "Family Medicine"] });
    const o = await run("search_options", {});
    expect(o.rows!.length).toBeLessThanOrEqual(25);
    expect(o.rows![0]).toMatchObject({ id: expect.any(String), college: expect.any(String), quota: expect.any(String), link: expect.stringMatching(/^\/decide\/institutes\//) });
    expect(JSON.stringify(o).length).toBeLessThan(40_000);
  });

  it("college_profile, last_ranks and compare resolve names like 'Kokilaben' and 'Seth GS'", async () => {
    const c = await run("college_profile", { college: "Kokilaben Dhirubhai Ambani Hospital and Medical Research Institute", course: "DNB Anaesthesiology" });
    expect(c).toMatchObject({ state: "Maharashtra" });
    expect((c.options as { course: string }[])[0].course).toBe("DNB Anaesthesiology");
    const l = await run("last_ranks", { course: "DNB Anaesthesiology", college: "Kokilaben Dhirubhai Ambani Hospital and Medical Research Institute" });
    expect((l.rows as { closings: string[] }[])[0].closings[0]).toMatch(/^2026: R1 /);
    const cmp = await run("compare", { colleges: ["Kokilaben Dhirubhai Ambani Hospital and Medical Research", "Seth GS"], course: "Anaesthesiology" });
    expect((cmp.colleges as { college: string }[]).map((x) => x.college)).toEqual(["Kokilaben Dhirubhai Ambani Hospital and Medical Research Institute", "Seth Gordhandas Sunderdas Medical College"]);
  });

  it("schedule, score_to_rank, find_colleges and draft_choice_list", async () => {
    const s = await run("schedule", {});
    expect(s.year).toBe(2026);
    expect((await run("score_to_rank", { score: 419, year: 2026 })).years).toMatchObject([{ year: 2026, at: { score: 419, bestRank: 42158, worstRank: 42573 } }]);
    expect((await run("find_colleges", { query: "GMC Nagpur" })).total).toBeGreaterThan(0);
    const d = await run("draft_choice_list", { courses: ["DNB Anaesthesiology", "MD Anaesthesiology"], limit: 20 });
    const all = ["dream", "realistic", "safe", "unknown"].flatMap((b) => d[b] as { id: string }[]);
    expect(all.length).toBeGreaterThan(5);
    expect(all.length).toBeLessThanOrEqual(24);
  });

  it("save_choice_list writes her account's Choices (ids or college/course/quota), create_report a report only she can open", async () => {
    const { db } = await import("@/lib/db");
    const { getReport } = await import("./reports");
    const { parseChoices } = await import("@/features/decide/lib/choices");
    const user = await db.user.create({ data: { email: `ask-tools-${Date.now()}@seatora.test`, name: "Tools test", passwordHash: "x", role: "PREMIUM" } });
    const me = { ...ctx, userId: user.id, refs: new Map<string, string>() };
    try {
      const d = (await runTool("draft_choice_list", { courses: ["DNB Anaesthesiology"], limit: 10 }, me, 15_000)) as { ok: true; data: { realistic: { ref: string; college: string; state: string; pin: string; course: string; quota: string }[] } };
      const [ra, rb, rc] = d.data.realistic;
      const a = { id: me.refs.get(ra.ref)! };
      const b = { ...rb, id: me.refs.get(rb.ref)! };
      const saved = await runTool("save_choice_list", { items: [{ ref: ra.ref }, { college: `${b.college}, ${b.state} ${b.pin}`, course: b.course, quota: b.quota }, { college: "No Such College", course: "MD Anaesthesiology", quota: "All India" }], mode: "replace", confirmed: true }, me, 15_000);
      expect(saved).toMatchObject({ ok: true, data: { saved: 2, notFound: ["No Such College / MD Anaesthesiology / All India"], link: "/decide/choices" } });
      let state = parseChoices((await db.userChoices.findUnique({ where: { userId: user.id } }))!.json);
      expect(state.activeId).toBe("ask-ask-seatora-plan");
      expect(state.lists.find((l) => l.id === state.activeId)!.items.map((x) => x.id)).toEqual([a.id, b.id]);
      await runTool("save_choice_list", { items: [{ id: b.id }, { ref: rc.ref }], mode: "append", confirmed: true }, me, 15_000);
      state = parseChoices((await db.userChoices.findUnique({ where: { userId: user.id } }))!.json);
      expect(state.lists.find((l) => l.id === state.activeId)!.items.map((x) => x.id)).toEqual([a.id, b.id, me.refs.get(rc.ref)]);

      const r = (await runTool("create_report", { title: "Round 2 plan", summary: "Where you stand.", choices: [{ id: a.id, reason: "Reached in 2025" }], risks: ["Round 3 cannot be resigned."] }, me, 15_000)) as { ok: true; data: { reportId: string; link: string } };
      expect(r.data.link).toBe(`/decide/ask/report/${r.data.reportId}`);
      const rep = await getReport(r.data.reportId, user.id);
      expect(rep!.content.choices[0]).toMatchObject({ course: "DNB Anaesthesiology", reason: "Reached in 2025" });
      expect(rep!.content.sources[0].name).toMatch(/MCC Information Bulletin/);
      expect(await getReport(r.data.reportId, "someone-else")).toBeNull();
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("assess_chances bands every option with seats this round in one fast call; present_choice_list shows a 30-line list", async () => {
    const refs = new Map<string, string>();
    const t0 = Date.now();
    const a = (await runTool("assess_chances", { courses: ["Anaesthesiology"], rank: 25000, category: "Open" }, { ...ctx, refs }, 15_000)) as { ok: true; data: Record<string, unknown> };
    expect(a.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
    const d = a.data as { counts: Record<string, number>; summary: string[]; likely: { ref: string; why: string; seatChange: string | null; trend: string | null }[]; possible: { ref: string }[]; comparedWith: string };
    expect(Object.keys(d.counts)).toEqual(["likely", "possible", "longShot", "unlikely", "noHistory"]);
    expect(d.summary.join("\n")).toMatch(/MD Anaesthesiology · All India: \d+ options with seats/);
    expect(d.comparedWith).toMatch(/^2025 R2 seat lists/);
    expect(d.likely[0]).toMatchObject({ ref: "c1", why: expect.stringMatching(/^Reached/), seatChange: expect.stringMatching(/clear vs 2025 R2/) });
    expect(JSON.stringify(a.data).length).toBeLessThan(60_000);

    const shown: string[] = [];
    const all = [...refs.keys()].slice(0, 30);
    const p = (await runTool("present_choice_list", { title: "Round 2 plan", items: all.map((ref) => ({ ref, why: "test" })) }, { ...ctx, refs, show: (md) => shown.push(md) }, 15_000)) as { ok: true; data: { shown: number } };
    expect(p.data.shown).toBe(all.length);
    expect(shown[0].match(/^\| \d+ \|/gm)).toHaveLength(all.length);
    expect(shown[0]).toContain("```Copy in MCC order");
  });
});
