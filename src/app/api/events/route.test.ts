import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/events with the cookies, the session and the tables mocked: the whitelist, identity from cookies only, bots.
const AID = "AAAAAAAAAAAAAAAAAAAAAA";
const m = vi.hoisted(() => ({ events: [] as Record<string, unknown>[], errors: [] as Record<string, unknown>[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "seatora_aid" ? { value: "AAAAAAAAAAAAAAAAAAAAAA" } : undefined) }) }));
vi.mock("@/features/auth/lib/session", () => ({ getCurrentUser: async () => ({ id: "u_cookie" }) }));
vi.mock("@/lib/db", () => ({
  db: {
    funnelEvent: { create: async ({ data }: { data: Record<string, unknown> }) => m.events.push(data) },
    errorGroup: { upsert: async ({ create }: { create: Record<string, unknown> }) => (m.errors.push(create), { count: 2 }) },
  },
}));
const { POST } = await import("./route");

const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const send = (body: unknown, ua = chrome) => POST(new Request("http://test/api/events", { method: "POST", headers: { "user-agent": ua }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  m.events = [];
  m.errors = [];
});

describe("POST /api/events", () => {
  it("rejects names and placements off the whitelist, server-only events and junk (400, nothing stored)", async () => {
    for (const body of [{ name: "free_claimed" }, { name: "anything" }, { name: "upgrade_click", placement: "nowhere" }, {}, "not json"]) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(400);
    }
    await flush();
    expect(m.events).toEqual([]);
  });

  it("stores a whitelisted event with the device and account from the cookies, never ids from the body", async () => {
    const res = await send({ name: "upgrade_click", placement: "popup", userId: "u_evil", aid: "evil", meta: { email: "a@b.c" } });
    expect(res.status).toBe(204);
    await flush();
    expect(m.events).toEqual([{ name: "upgrade_click", aid: AID, userId: "u_cookie", placement: "popup", meta: {} }]);
  });

  it("ignores bots (204, nothing stored) and records a browser error, scrubbed", async () => {
    expect((await send({ name: "landing_view" }, "Mozilla/5.0 (compatible; Googlebot/2.1)")).status).toBe(204);
    await send({ kind: "client_error", message: "Failed for rahul@gmail.com", digest: "99", route: "/decide/options?rank=1" });
    await flush();
    expect(m.events).toEqual([]);
    expect(m.errors).toEqual([expect.objectContaining({ kind: "client_error", message: "Failed for <email>", route: "/decide/options", lastDigest: "99" })]);
  });
});
