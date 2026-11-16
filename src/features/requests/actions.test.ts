import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isOwner } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { setRequestStatus, submitFeatureRequest } from "./actions";
import { listAllRequests, listMyRequests } from "./server";
import { featureRequestSchema } from "./validations";

// Read before the imports run: unset, Prisma would load the worktree .env (another database) and these tests write and
// delete rows. Only an exported DATABASE_URL (a scratch database) runs them.
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));
// The request's IP and session cookie, set per call.
const ctx = vi.hoisted(() => ({ ip: "198.51.100.1" as string | undefined, token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(ctx.ip ? { "x-real-ip": ctx.ip } : {}),
  cookies: async () => ({ get: (name: string) => (name === "medpath_session" && ctx.token ? { value: ctx.token } : undefined) }),
}));

const OWNER = "owner@seatora.test";
const BUYER = "buyer@seatora.test";
const VISITOR = "visitor@seatora.test";
vi.stubEnv("SEATORA_ALLOWED_EMAILS", `${OWNER},${BUYER}`);
vi.stubEnv("SEATORA_OWNER_EMAILS", ` ${OWNER.toUpperCase()} `);

let n = 0;
const fresh = () => (ctx.ip = `198.51.100.${++n}`); // a new IP per call, past the 3-a-minute limit
const ok = { kind: "feature" as const, message: "Please add a hostel column to Seats." };

describe("submitFeatureRequest without the database", () => {
  it("validates: kind, message length, email", async () => {
    expect(featureRequestSchema.safeParse({ ...ok, kind: "nope" }).success).toBe(false);
    expect(featureRequestSchema.safeParse({ ...ok, message: "x".repeat(2001) }).success).toBe(false);
    expect(featureRequestSchema.parse({ ...ok, email: " A@B.co " }).email).toBe("a@b.co");
    fresh();
    expect(await submitFeatureRequest({ ...ok, message: "short" })).toEqual({ ok: false, error: "Please write at least 10 characters." });
    fresh();
    expect(await submitFeatureRequest({ ...ok, email: "nope" })).toEqual({ ok: false, error: "Enter a valid email so we can reply." });
    fresh();
    expect(await submitFeatureRequest(ok)).toEqual({ ok: false, error: "Enter your email so we can reply." }); // signed out, no email
  });

  it("pretends success to bots that fill the honeypot", async () => {
    fresh();
    expect(await submitFeatureRequest({ ...ok, website: "http://spam.example" })).toEqual({ ok: true });
  });

  it("allows 3 a minute per IP", async () => {
    const bot = { ...ok, website: "x" }; // never reaches the database
    fresh();
    for (let i = 0; i < 3; i++) expect(await submitFeatureRequest(bot)).toEqual({ ok: true });
    expect(await submitFeatureRequest(bot)).toEqual({ ok: false, error: "Too many requests. Please wait a minute and try again." });
    fresh();
    expect(await submitFeatureRequest(bot)).toEqual({ ok: true }); // another IP
  });

  it("allows 5 a day per IP signed out, before the shared cap", async () => {
    const now = vi.spyOn(Date, "now");
    let t = Date.now();
    ctx.token = undefined;
    fresh();
    const tick = () => now.mockReturnValue((t += 61_000)); // past the 3-a-minute window each time
    // No email: turned away after the day count and before the database, so this needs none.
    for (let i = 0; i < 5; i++) {
      tick();
      expect(await submitFeatureRequest(ok)).toEqual({ ok: false, error: "Enter your email so we can reply." });
    }
    tick();
    expect(await submitFeatureRequest(ok)).toEqual({ ok: false, error: expect.stringMatching(/^You've sent 5 requests today\. Please try again tomorrow/) });
    fresh();
    expect(await submitFeatureRequest(ok)).toEqual({ ok: false, error: "Enter your email so we can reply." }); // another IP
    now.mockRestore();
  });

  // Owner is a role now (User.role, features/plans): with a session it takes a database read, covered below.
  it("denies the owner tools when signed out", async () => {
    ctx.token = undefined;
    expect(await isOwner()).toBe(false);
    expect(await listAllRequests()).toBeNull();
    expect(await setRequestStatus("x", "done")).toEqual({ ok: false, error: "You don't have access to this." });
  });
});

// Scratch database only (migrated fresh), e.g. DATABASE_URL=postgresql://localhost/seatora_requests_scratch npx vitest run src/features/requests
describe.skipIf(!dbUrl)("requests on a scratch database", { timeout: 30_000 }, () => {
  const tokens = { owner: randomBytes(16).toString("hex"), buyer: randomBytes(16).toString("hex") };
  const ids = { owner: "", buyer: "" };
  const as = (who: keyof typeof tokens | null) => {
    ctx.token = who ? tokens[who] : undefined;
    fresh();
  };

  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { in: [OWNER, BUYER] } } });
    for (const [who, email] of [["owner", OWNER], ["buyer", BUYER]] as const) {
      const u = await db.user.create({ data: { email, name: who, passwordHash: "x" } });
      ids[who] = u.id;
      await db.session.create({ data: { id: createHash("sha256").update(tokens[who]).digest("hex"), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    }
  });
  afterAll(async () => {
    await db.featureRequest.deleteMany({ where: { email: { in: [OWNER, BUYER, VISITOR] } } });
    await db.user.deleteMany({ where: { email: { in: [OWNER, BUYER] } } });
  });

  it("stores a signed-in request with her account and email, and a signed-out one with the email given", async () => {
    as("buyer");
    expect(await submitFeatureRequest({ ...ok, page: "/decide/seats" })).toEqual({ ok: true });
    as(null);
    expect(await submitFeatureRequest({ kind: "data", message: "AIIMS Delhi fee is missing.", email: "Visitor@Seatora.test" })).toEqual({ ok: true });
    const rows = await db.featureRequest.findMany({ orderBy: { kind: "desc" } });
    expect(rows.map((r) => [r.kind, r.email, r.userId, r.page, r.status])).toEqual([
      ["feature", BUYER, ids.buyer, "/decide/seats", "new"],
      ["data", VISITOR, null, null, "new"],
    ]);
    expect(JSON.stringify(rows)).not.toContain("198.51.100."); // never the IP
  });

  it("lets a user read only her own requests", async () => {
    as("buyer");
    expect((await listMyRequests()).map((r) => r.message)).toEqual([ok.message]);
    as("owner");
    expect(await listMyRequests()).toEqual([]);
    as(null);
    expect(await listMyRequests()).toEqual([]);
  });

  it("lets only the owner list everything and set a status", async () => {
    const [first] = await db.featureRequest.findMany({ where: { userId: ids.buyer } });
    as("buyer");
    expect(await isOwner()).toBe(false);
    expect(await listAllRequests()).toBeNull();
    expect(await setRequestStatus(first.id, "planned")).toEqual({ ok: false, error: "You don't have access to this." });
    expect((await db.featureRequest.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("new");

    as("owner");
    expect(await isOwner()).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.owner } })).role).toBe("OWNER"); // SEATORA_OWNER_EMAILS promoted the account
    vi.stubEnv("SEATORA_OWNER_EMAILS", "");
    as("owner");
    expect(await isOwner()).toBe(true); // the role holds without the env
    vi.stubEnv("SEATORA_OWNER_EMAILS", OWNER);
    const all = await listAllRequests();
    expect([all?.total, all?.page, all?.pageSize, all?.rows.map((r) => r.kind)]).toEqual([2, 1, 50, ["data", "feature"]]);
    expect(typeof all?.rows[0].createdAt).toBe("string");
    expect(all?.rows.map((r) => r.account)).toEqual([null, BUYER]); // the checked sender, not the typed email
    expect(await setRequestStatus(first.id, "planned")).toEqual({ ok: true });
    expect(await setRequestStatus(first.id, "shipped")).toEqual({ ok: false, error: "Invalid status." });
    expect(await setRequestStatus("no-such-id", "done")).toEqual({ ok: false, error: "That request no longer exists." });
    expect((await listAllRequests({ status: "planned" }))?.rows.map((r) => r.id)).toEqual([first.id]);
    expect((await listAllRequests({ kind: "data", status: "bogus", page: "x" }))?.total).toBe(1); // bad filters fall back
    expect((await listAllRequests({ page: 2 }))?.rows).toEqual([]);
  });

  it("caps an account at 10 a day, in the database", async () => {
    await db.featureRequest.createMany({ data: Array.from({ length: 9 }, () => ({ kind: "other", message: "filler request", email: BUYER, userId: ids.buyer })) });
    as("buyer");
    expect(await submitFeatureRequest(ok)).toEqual({ ok: false, error: "You've sent 10 requests today. Please try again tomorrow." });
    as("owner");
    expect(await submitFeatureRequest(ok)).toEqual({ ok: true }); // another account
  });

  it("never logs the message or email when saving fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    as(null);
    const message = "Secret text with a NUL \u0000 Postgres refuses";
    expect(await submitFeatureRequest({ kind: "other", message, email: "private@mail.com" })).toEqual({ ok: false, error: "We couldn't save your request. Please try again in a moment." });
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).toContain("submitFeatureRequest failed");
    expect(logged).not.toMatch(/Secret text|private@mail/);
  });

  it("caps everyone signed out at 100 a day, together", async () => {
    const sent = await db.featureRequest.count({ where: { userId: null } });
    await db.featureRequest.createMany({ data: Array.from({ length: 100 - sent }, () => ({ kind: "other", message: "filler request", email: VISITOR })) });
    as(null);
    expect(await submitFeatureRequest({ ...ok, email: VISITOR })).toEqual({ ok: false, error: expect.stringMatching(/^We've had too many requests today\. Please try again tomorrow/) }); // then the contact email, when set
    as("owner");
    expect(await submitFeatureRequest(ok)).toEqual({ ok: true }); // signed in: her own cap
  });

  it("keeps requests, unlinked, when the account is deleted", async () => {
    await db.user.delete({ where: { id: ids.buyer } });
    expect(await db.featureRequest.count({ where: { email: BUYER, userId: null } })).toBe(10);
  });
});
