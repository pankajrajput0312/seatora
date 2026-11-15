import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signUp } from "./actions";
import { hasSiteAccess, isOwner } from "./lib/session";

// Sign-up and sign-in in both modes, on an in-memory stand-in for the user and session tables (no database), with the
// request's IP and cookie jar per call. redirect() throws, as in Next, with the target in the message.
const ctx = vi.hoisted(() => ({
  ip: "203.0.113.1",
  jar: new Map<string, string>(),
  users: [] as { id: string; email: string; name: string; passwordHash: string; failedLogins: number; lockedUntil: Date | null }[],
  sessions: new Map<string, { userId: string; expiresAt: Date }>(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": ctx.ip }),
  cookies: async () => ({
    get: (name: string) => (ctx.jar.has(name) ? { value: ctx.jar.get(name)! } : undefined),
    set: (name: string, value: string) => ctx.jar.set(name, value),
    delete: (name: string) => ctx.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("./lib/password", () => ({
  dummyHash: Promise.resolve("hash:"),
  hashPassword: async (p: string) => `hash:${p}`,
  verifyPassword: async (p: string, h: string) => h === `hash:${p}`,
}));
vi.mock("@/lib/db", () => {
  const user = (id: string) => ctx.users.find((u) => u.id === id)!;
  return {
    db: {
      user: {
        create: async ({ data }: { data: { email: string; name: string; passwordHash: string } }) => {
          if (ctx.users.some((u) => u.email === data.email)) {
            const { Prisma } = await import("@prisma/client");
            throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
          }
          const u = { ...data, id: `u${ctx.users.length + 1}`, failedLogins: 0, lockedUntil: null };
          ctx.users.push(u);
          return u;
        },
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => ctx.users.find((u) => u.email === where.email || u.id === where.id) ?? null,
        update: async ({ where }: { where: { id: string } }) => user(where.id),
        updateMany: async () => ({ count: 0 }),
      },
      session: {
        create: async ({ data }: { data: { id: string; userId: string; expiresAt: Date } }) => ctx.sessions.set(data.id, data),
        findUnique: async ({ where }: { where: { id: string } }) => {
          const s = ctx.sessions.get(where.id);
          return s && { ...s, user: user(s.userId) };
        },
        deleteMany: async () => ({ count: 0 }),
      },
    },
  };
});


const SECRET = "x".repeat(64);
const OWNER = "owner@seatora.test";
let n = 0;
const fresh = () => {
  ctx.ip = `203.0.113.${++n}`;
  ctx.jar.clear();
};
const failsWith = async (p: Promise<unknown>) => p.then((r) => r, (e: Error) => e.message);
const person = (email: string) => ({ name: "Aspirant", email, password: "a-long-password" });

beforeEach(() => {
  ctx.users.length = 0;
  ctx.sessions.clear();
  fresh();
  vi.stubEnv("SITE_ACCESS_SECRET", SECRET);
  vi.stubEnv("SEATORA_OWNER_EMAILS", OWNER);
  vi.stubEnv("SEATORA_ALLOWED_EMAILS", "invited@seatora.test");
  vi.stubEnv("SEATORA_INVITE_CODE", "0123456789abcdef");
});

describe("open access (SEATORA_OPEN_ACCESS=1)", () => {
  beforeEach(() => vi.stubEnv("SEATORA_OPEN_ACCESS", "1"));

  it("signs anyone up without an invite code, gives Decide access and lands on /decide; ?next= stays same-origin", async () => {
    expect(await failsWith(signUp(person("new@seatora.test")))).toBe("REDIRECT /decide");
    expect(ctx.jar.has("seatora_access")).toBe(true);
    expect(await hasSiteAccess()).toBe(true);
    expect(await isOwner()).toBe(false);
    for (const next of ["//evil.test", "https://evil.test", "/\\evil.test", "/.//evil.test"]) {
      fresh();
      expect(await failsWith(signIn(person("new@seatora.test"), next))).toBe("REDIRECT /decide");
    }
    fresh();
    expect(await failsWith(signIn(person("new@seatora.test"), "/decide/residents?q=a"))).toBe("REDIRECT /decide/residents?q=a");
  });

  it("won't let anyone claim an owner address; limits sign-ups to 5 an hour per IP", async () => {
    expect(await signUp(person(OWNER.toUpperCase()))).toEqual({ ok: false, error: "This email can't be used to sign up. Sign in instead." });
    for (let i = 0; i < 5; i++) {
      ctx.jar.clear();
      expect(await failsWith(signUp(person(`n${i}@seatora.test`)))).toBe("REDIRECT /decide");
    }
    expect(await signUp(person("n6@seatora.test"))).toEqual({ ok: false, error: "Too many accounts from this network. Please try again in an hour." });
    expect(ctx.users).toHaveLength(5);
    fresh();
    expect(await failsWith(signUp(person("n6@seatora.test")))).toBe("REDIRECT /decide"); // another IP
  });

  it("switching the mode signs everyone out of Decide (the cookie key changes)", async () => {
    await failsWith(signUp(person("new@seatora.test")));
    vi.stubEnv("SEATORA_OPEN_ACCESS", "");
    expect(await hasSiteAccess()).toBe(false);
  });
});

describe("invite only (SEATORA_OPEN_ACCESS unset)", () => {
  beforeEach(() => vi.stubEnv("SEATORA_OPEN_ACCESS", ""));

  it("needs the allowlisted email and the invite code", async () => {
    expect(await signUp({ ...person("new@seatora.test"), invite: "" })).toEqual({ ok: false, error: "Enter your invite code" });
    const bad = { ok: false, error: expect.stringMatching(/^That email and invite code don't match an invite\./) };
    expect(await signUp({ ...person("new@seatora.test"), invite: "0123456789abcdef" })).toEqual(bad);
    expect(await signUp({ ...person("invited@seatora.test"), invite: "wrong-code-0000000" })).toEqual(bad);
    expect(ctx.users).toHaveLength(0);
    expect(await failsWith(signUp({ ...person("invited@seatora.test"), invite: "0123456789abcdef" }))).toBe("REDIRECT /decide");
    expect(await hasSiteAccess()).toBe(true);
  });

  it("refuses sign-in to an account that isn't allowlisted, with no session or cookie", async () => {
    ctx.users.push({ id: "u9", email: "new@seatora.test", name: "x", passwordHash: "hash:a-long-password", failedLogins: 0, lockedUntil: null });
    expect(await signIn(person("new@seatora.test"))).toEqual({ ok: false, error: "This account doesn't have access." });
    expect(ctx.jar.size).toBe(0);
    expect(await hasSiteAccess()).toBe(false);
  });
});
