import { beforeEach, describe, expect, it, vi } from "vitest";

// /r/CODE with the session and the User table mocked: the cookie, where it sends her, and the per-IP limit.
const m = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/features/auth/lib/session", () => ({ getCurrentUser: async () => (m.signedIn ? { id: "u_b" } : null) }));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: async ({ where }: { where: { referralCode: string } }) => (where.referralCode === "RHUX234" ? { id: "u_a", name: "Rahul Sharma" } : null) } },
}));
const { GET } = await import("./route");

let ip = 0;
const open = (code: string, from = `198.51.100.${++ip}`) =>
  GET(new Request(`http://test/r/${code}`, { headers: { "x-real-ip": from } }), { params: Promise.resolve({ code }) });

beforeEach(() => (m.signedIn = false));

describe("GET /r/[code]", () => {
  it("a real code sets the httpOnly seatora_ref cookie for 30 days and goes to sign-up", async () => {
    const res = await open("rhux234");
    expect([res.status, res.headers.get("location")]).toEqual([307, "/signup?ref=RHUX234"]);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^seatora_ref=RHUX234;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("signed in: on to Pricing; an unknown code sets nothing", async () => {
    m.signedIn = true;
    expect((await open("RHUX234")).headers.get("location")).toBe("/pricing");
    m.signedIn = false;
    const res = await open("ZZZZ999");
    expect([res.headers.get("location"), res.headers.get("set-cookie")]).toEqual(["/signup", null]);
  });

  it("limits lookups to 30 a minute per IP", async () => {
    const codes = await Promise.all(Array.from({ length: 31 }, (_, i) => open(`ZZZZ${100 + i}`, "203.0.113.77")));
    expect(codes.filter((r) => r.status === 429)).toHaveLength(1);
  });
});
