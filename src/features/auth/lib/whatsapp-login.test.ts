import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The challenge on an in-memory stand-in for the LoginChallenge table (no database).
type Row = { id: string; codeHash: string; browserHash: string; userId: string | null; phone: string | null; expiresAt: Date; consumedAt: Date | null };
const rows = vi.hoisted(() => [] as Row[]);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => {
  const find = (w: Partial<Row>) => rows.find((r) => Object.entries(w).every(([k, v]) => r[k as keyof Row] === v)) ?? null;
  return {
    db: {
      loginChallenge: {
        create: async ({ data }: { data: Omit<Row, "id" | "userId" | "phone" | "consumedAt"> }) => rows.push({ userId: null, phone: null, consumedAt: null, ...data, id: `c${rows.length}` }),
        deleteMany: async () => ({ count: 0 }),
        findUnique: async ({ where }: { where: Partial<Row> }) => find(where),
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(find(where)!, data),
        updateMany: async ({ where, data }: { where: { id: string; consumedAt: null }; data: Partial<Row> }) => {
          const r = rows.find((x) => x.id === where.id && x.consumedAt === null);
          if (r) Object.assign(r, data);
          return { count: r ? 1 : 0 };
        },
      },
    },
  };
});
const { finishChallenge, linkChallenge, loginMessage, newCode, openToken, parseLoginCode, startChallenge, waLink, WA_LOGIN_TTL_MS } = await import("./whatsapp-login");

beforeEach(() => void rows.splice(0));

describe("WhatsApp sign-in", () => {
  it("makes 8-character codes without look-alike characters, stored only as hashes", async () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const { code, token } = await startChallenge();
    expect(rows[0].codeHash).toBe(createHash("sha256").update(code).digest("hex"));
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(waLink(code)).toBe(`https://wa.me/917011488467?text=${encodeURIComponent(`Log in to Seatora · code ${code}`)}`);
  });

  it("reads the prefilled message and a bare code, not ordinary text", () => {
    expect(parseLoginCode(loginMessage("AB3K9XQZ"))).toEqual({ code: "AB3K9XQZ", full: true });
    expect(parseLoginCode("log in to seatora code ab3k9xqz")).toEqual({ code: "AB3K9XQZ", full: true });
    expect(parseLoginCode(" AB3K9XQZ ")).toEqual({ code: "AB3K9XQZ", full: false });
    expect(parseLoginCode("hi")).toBeNull();
    expect(parseLoginCode("medicine")).toBeNull();
    expect(parseLoginCode("What can I get at 44238?")).toBeNull();
  });

  it("signs in only the browser that started it, once, after the phone sends the code", async () => {
    const { code, token } = await startChallenge();
    const other = await startChallenge();
    expect(await finishChallenge(token)).toEqual({ state: "pending" });
    expect(await linkChallenge(code, "u1", "919800000000")).toBe("linked");
    expect(await finishChallenge(other.token)).toEqual({ state: "pending" }); // another browser's cookie: not this login
    expect(await finishChallenge("forged")).toEqual({ state: "expired" });
    expect(await finishChallenge(token)).toEqual({ state: "ok", userId: "u1" });
    expect(await finishChallenge(token)).toEqual({ state: "expired" }); // one-time
    expect(await linkChallenge(code, "u1", "919800000000")).toBe("expired");
  });

  it("expires after 10 minutes, and a code already claimed by one number can't be taken by another", async () => {
    const t0 = new Date("2026-11-17T10:00:00Z");
    const a = await startChallenge(t0);
    expect(await linkChallenge(a.code, "u1", "91981", new Date(t0.getTime() + WA_LOGIN_TTL_MS + 1))).toBe("expired");
    expect(await finishChallenge(a.token, new Date(t0.getTime() + WA_LOGIN_TTL_MS + 1))).toEqual({ state: "expired" });
    const b = await startChallenge();
    expect(await linkChallenge(b.code, "u1", "91981")).toBe("linked");
    expect(await linkChallenge(b.code, "u2", "91982")).toBe("expired");
    expect(await linkChallenge("ZZZZZZZZ", "u1", "91981")).toBe("none");
  });

  it("gives the reply's Open Seatora link: her account, once, for 10 minutes", async () => {
    const t = await openToken("u1", "91981");
    expect(JSON.stringify(rows)).not.toContain(t);
    expect(await finishChallenge(t)).toEqual({ state: "ok", userId: "u1" });
    expect(await finishChallenge(t)).toEqual({ state: "expired" });
    const t0 = new Date("2026-11-17T10:00:00Z");
    const late = await openToken("u1", "91981", t0);
    expect(await finishChallenge(late, new Date(t0.getTime() + WA_LOGIN_TTL_MS + 1))).toEqual({ state: "expired" });
  });
});
