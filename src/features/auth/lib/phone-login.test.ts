import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { toE164 } from "./phone-login";

vi.mock("server-only", () => ({}));
const { verifyPhoneToken } = await import("./phone-token");

describe("toE164", () => {
  it("reads Indian mobiles however typed, and other countries with their +code", () => {
    for (const t of ["9876543210", "98765 43210", "09876543210", "919876543210", "+91 98765-43210"]) expect(toE164(t)).toBe("+919876543210");
    expect(toE164("+1 650-555-3434")).toBe("+16505553434");
    for (const t of ["", "12345", "5876543210", "+91 5876543210", "98765432101", "abc9876543210"]) expect(toE164(t)).toBeNull();
  });
});

describe("verifyPhoneToken", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const now = 1_800_000_000;
  const good = { aud: "proj", iss: "https://securetoken.google.com/proj", sub: "u1", iat: now - 5, exp: now + 3600, auth_time: now - 5, phone_number: "+919876543210", firebase: { sign_in_provider: "phone" } };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (claims: object, { key = privateKey, header = { alg: "RS256", kid: "k1" } } = {}) => {
    const body = `${b64(header)}.${b64(claims)}`;
    return `${body}.${sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
  };
  const check = (t: string) => verifyPhoneToken(t, { projectId: "proj", now, certOf: async (kid) => (kid === "k1" ? pem : undefined) });

  it("returns the number of a fresh phone sign-in to this project", async () => {
    expect(await check(jwt(good))).toBe("+919876543210");
  });
  it("refuses a bad signature, another key, project, issuer or provider, an old or expired sign-in, junk", async () => {
    const bad = [
      jwt(good, { key: other }),
      jwt(good, { header: { alg: "RS256", kid: "k2" } }),
      jwt(good, { header: { alg: "none", kid: "k1" } }),
      jwt({ ...good, aud: "other" }),
      jwt({ ...good, iss: "https://securetoken.google.com/other" }),
      jwt({ ...good, sub: "" }),
      jwt({ ...good, exp: now - 1 }),
      jwt({ ...good, auth_time: now - 700 }),
      jwt({ ...good, firebase: { sign_in_provider: "password" } }),
      jwt({ ...good, phone_number: undefined }),
      jwt(good).replace(/\.[^.]+$/, ".AAAA"),
      `${jwt(good)}.x`,
      "not.a.token",
      "",
    ];
    for (const t of bad) expect(await check(t)).toBeNull();
  });
});
