import { beforeEach, describe, expect, it, vi } from "vitest";

// recordError on an in-memory ErrorGroup (upsert = count + 1 per fingerprint) with fetch stubbed: what is stored, how
// errors group, and when the webhook is called.
const m = vi.hoisted(() => ({ groups: new Map<string, { message: string; route: string; count: number }>() }));
vi.mock("@/lib/db", () => ({
  db: {
    errorGroup: {
      upsert: async ({ where, create }: { where: { fingerprint: string }; create: { message: string; route: string } }) => {
        const g = m.groups.get(where.fingerprint) ?? { message: create.message, route: create.route, count: 0 };
        g.count++;
        m.groups.set(where.fingerprint, g);
        return { count: g.count };
      },
    },
  },
}));
const { recordError } = await import("./service");

const fetchMock = vi.fn(async () => new Response(null));
beforeEach(() => {
  m.groups.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ALERT_WEBHOOK_URL", "http://127.0.0.1:9/hook");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.seatora.test");
});

describe("recordError", () => {
  it("groups one bug whatever its ids, emails and numbers; stores no email, token or query", async () => {
    await recordError({ kind: "server", route: "/decide/institutes/[slug]?rank=1234&cat=OBC", message: "User rahul.s@gmail.com (clx1abc2def3ghi4jkl5mno6p) failed after 3 tries at /x?token=abc123", digest: "123" });
    await recordError({ kind: "server", route: "/decide/institutes/[slug]", message: "User priya@seatora.test (ck9zzzzzzzzzzzzzzzzzzzzz9) failed after 12 tries at /x?token=zzz", digest: "456" });
    await recordError({ kind: "server", route: "/decide/institutes/[slug]", message: "Something else entirely" });
    await recordError({ kind: "client_error", route: "/decide/institutes/[slug]", message: "Something else entirely" });
    expect(m.groups.size).toBe(3);
    const [first] = m.groups.values();
    expect(first).toEqual({ route: "/decide/institutes/[slug]", message: "User <email> (<token>) failed after 3 tries at /x", count: 2 });
  });

  it("keeps the first and last line of a long message (no argument dump in the middle)", async () => {
    await recordError({ kind: "server", route: "/a", message: "\nInvalid `prisma.user.create()` invocation:\n{ data: { name: \"Rahul Sharma\" } }\nUnique constraint failed on the fields: (`email`)" });
    expect([...m.groups.values()][0].message).toBe("Invalid `prisma.user.create()` invocation: … Unique constraint failed on the fields: (`email`)");
  });

  it("alerts on the 1st, 10th and 100th occurrence only, with both text (Slack) and content (Discord)", async () => {
    for (let i = 0; i < 120; i++) await recordError({ kind: "server", route: "/decide", message: `Boom ${i}`, method: "GET" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies.map((b) => b.text)).toEqual([
      "Seatora server error (new): Boom 0 · GET /decide\nhttps://www.seatora.test/decide/admin#errors-h",
      "Seatora server error, 10 times now: Boom 9 · GET /decide\nhttps://www.seatora.test/decide/admin#errors-h",
      "Seatora server error, 100 times now: Boom 99 · GET /decide\nhttps://www.seatora.test/decide/admin#errors-h",
    ]);
    expect(bodies.every((b) => b.content === b.text)).toBe(true);
  });

  it("sends nothing without ALERT_WEBHOOK_URL, and never throws", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    await recordError({ kind: "server", route: "/", message: "x" });
    expect(fetchMock).not.toHaveBeenCalled();
    m.groups = null as never; // the database is down
    await expect(recordError({ kind: "server", route: "/", message: "y" })).resolves.toBeUndefined();
  });
});
