import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is mocked: these check validation, timeouts and error handling, not data (tools.db.test.ts does that).
const svc = vi.hoisted(() => ({ getMeta: vi.fn(), getDecideData: vi.fn() }));
vi.mock("@/features/decide/service", async (orig) => ({ ...(await orig<object>()), ...svc }));

const { runTool, toolDefs, toolSchemas } = await import("./tools");
const ctx = { userId: "u1", profile: null };

beforeEach(() => {
  svc.getMeta.mockReset();
  svc.getDecideData.mockReset();
});

/** Optional properties in a JSON schema, nested objects (array items) included. */
function countOptional(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const o = node as { properties?: Record<string, unknown>; required?: string[]; items?: unknown };
  const own = o.properties ? Object.keys(o.properties).filter((k) => !o.required?.includes(k)).length : 0;
  return own + Object.values(o.properties ?? {}).reduce<number>((n, v) => n + countOptional(v), 0) + countOptional(o.items);
}

describe("tool definitions", () => {
  it("are strict object schemas without keywords structured outputs reject", () => {
    expect(toolDefs.map((t) => t.name)).toEqual(Object.keys(toolSchemas));
    // The API's limit: 24 optional parameters across strict tools.
    expect(toolDefs.filter((t) => t.strict).reduce((n, t) => n + countOptional(t.input_schema), 0)).toBeLessThanOrEqual(24);
    for (const t of toolDefs) {
      expect(t.input_schema.type).toBe("object");
      expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
      expect(JSON.stringify(t.input_schema)).not.toMatch(/"(minimum|maximum|minLength|maxLength|minItems|maxItems|pattern|\$schema)"/);
    }
  });
});

describe("runTool", () => {
  it("rejects unknown tools and invalid input as tool errors, never throwing", async () => {
    expect(await runTool("drop_tables", {}, ctx, 1000)).toEqual({ ok: false, error: "Unknown tool drop_tables." });
    for (const [name, input] of [
      ["score_to_rank", { score: "419" }],
      ["score_to_rank", { score: 419, extra: 1 }],
      ["search_options", { rank: 0 }],
      ["search_options", { rank: 1e9 }],
      ["compare", { colleges: ["only one"], course: "MD Anaesthesiology" }],
      ["save_choice_list", { items: [], mode: "replace", confirmed: true }],
      ["save_choice_list", { items: [{ id: "x", sql: "drop" }], mode: "replace", confirmed: true }],
      ["last_ranks", { course: "x".repeat(500) }],
      ["load_skill", null],
    ] as const) {
      const r = await runTool(name, input, ctx, 1000);
      expect(r.ok, `${name} ${JSON.stringify(input)}`).toBe(false);
      expect((r as { error: string }).error).toMatch(/^Invalid input/);
    }
  });

  it("loads skills by name and says which exist when the name is wrong", async () => {
    expect(await runTool("load_skill", { name: "dnb-vs-md" }, ctx, 1000)).toMatchObject({ ok: true, data: { name: "dnb-vs-md" } });
    const r = await runTool("load_skill", { name: "nope" }, ctx, 1000);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("counselling-basics");
  });

  it("turns a failing lookup into a generic tool error (no internals) and a slow one into a timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    svc.getDecideData.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.1"));
    const failed = await runTool("find_colleges", { query: "KEM" }, ctx, 1000);
    expect(failed).toEqual({ ok: false, error: "The data lookup failed. Say the data is unavailable right now; do not guess." });
    svc.getDecideData.mockReturnValueOnce(new Promise(() => {}));
    const slow = await runTool("find_colleges", { query: "KEM" }, ctx, 20);
    expect(slow).toMatchObject({ ok: false });
    expect((slow as { error: string }).error).toMatch(/Timed out/);
  });

  it("asks for a rank when neither the profile nor the input has one", async () => {
    svc.getMeta.mockResolvedValue({ courses: [], degrees: [], quotas: ["All India"], states: [], specialties: [], sources: [], years: [] });
    expect(await runTool("search_options", {}, ctx, 1000)).toEqual({ ok: false, error: "No rank: ask her for her NEET PG All India Rank (AIR) and category." });
  });

  it("refuses to save a choice list she has not confirmed", async () => {
    const r = await runTool("save_choice_list", { items: [{ id: "a~MD~X~All India" }], mode: "replace", confirmed: false }, ctx, 1000);
    expect((r as { error: string }).error).toMatch(/confirm/);
  });
});
