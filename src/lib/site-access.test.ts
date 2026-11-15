import { expect, it } from "vitest";
import { ACCESS_MAX_AGE_S, accessCookie, accessCookieUser, inviteMatches, isAllowed, isMember, openAccess, parseAllowlist, safeNext, siteGate } from "./site-access";

const secret = "s".repeat(32) + "-correct-horse";
const allowed = "her@seatora.test";
const keyOf = (s: string, a: string, open = false) => {
  const gate = siteGate(s, a, true, open);
  if (gate.state !== "on") throw new Error("gate not on");
  return gate.key;
};

it("parses the allowlist: trimmed, lowercased, no empties, deduplicated, sorted", () => {
  expect(parseAllowlist(" B@Seatora.test, ,a@seatora.test,,b@seatora.test ")).toEqual(["a@seatora.test", "b@seatora.test"]);
  expect(parseAllowlist("")).toEqual([]);
  expect(parseAllowlist(" , ")).toEqual([]);
  expect(parseAllowlist(undefined)).toEqual([]);
  const list = parseAllowlist(allowed);
  expect(isAllowed("  HER@seatora.TEST ", list)).toBe(true);
  expect(isAllowed("someone@seatora.test", list)).toBe(false);
  expect(isAllowed(allowed, [])).toBe(false);
});

it("is off only in development with neither variable set, and fails closed otherwise", () => {
  expect(siteGate("", "", false, false)).toEqual({ state: "off" });
  expect(siteGate("", "", true, false)).toEqual({ state: "closed" });
  expect(siteGate(secret, "", false, false)).toEqual({ state: "closed" }); // no allowlist
  expect(siteGate(secret, " , ", true, false)).toEqual({ state: "closed" });
  expect(siteGate("", allowed, false, false)).toEqual({ state: "closed" }); // no secret
  expect(siteGate("s".repeat(31), allowed, false, false)).toEqual({ state: "closed" }); // too short
  expect(siteGate(secret, ` ${allowed.toUpperCase()} `, true, false)).toEqual({ state: "on", key: `${secret}|${allowed}`, open: false, allowlist: [allowed] });
  // Order and case don't change the key; membership does.
  expect(keyOf(secret, "b@x.test,A@x.test")).toBe(keyOf(secret, "a@x.test, b@x.test"));
});

it("open mode (SEATORA_OPEN_ACCESS=1) needs only the secret, admits every account and has its own cookie key", () => {
  expect(openAccess("1")).toBe(true);
  expect(openAccess(" 1 ")).toBe(true);
  for (const raw of [undefined, "", "0", "true", "yes"]) expect(openAccess(raw)).toBe(false);
  expect(siteGate(secret, "", true, true)).toEqual({ state: "on", key: `${secret}|*open*`, open: true, allowlist: [] });
  expect(siteGate("", "", false, true)).toEqual({ state: "closed" }); // no secret: closed, even in development
  expect(siteGate("s".repeat(31), allowed, true, true)).toEqual({ state: "closed" });
  // Switching the mode voids every cookie, both ways.
  expect(keyOf(secret, allowed, true)).not.toBe(keyOf(secret, allowed, false));
  expect(keyOf(secret, allowed, true)).toBe(keyOf(secret, "", true));
  // Membership: anyone when open, else only the allowlist.
  expect(isMember("someone@seatora.test", true, [])).toBe(true);
  expect(isMember("someone@seatora.test", false, [allowed])).toBe(false);
  expect(isMember(" HER@seatora.test", false, [allowed])).toBe(true);
});

it("issues a cookie bound to one user that lasts 30 days and dies on tampering or a new secret or allowlist", async () => {
  const now = 1_700_000_000_000;
  const key = keyOf(secret, allowed);
  const cookie = await accessCookie(key, "user1", now);
  expect(cookie).not.toContain(secret);
  expect(await accessCookieUser(cookie, key, now)).toBe("user1");
  expect(await accessCookieUser(cookie, key, now + (ACCESS_MAX_AGE_S - 1) * 1000)).toBe("user1");
  expect(await accessCookieUser(cookie, key, now + ACCESS_MAX_AGE_S * 1000)).toBeNull(); // expired
  expect(await accessCookieUser(cookie, keyOf(secret + "-rotated", allowed), now)).toBeNull(); // secret changed
  expect(await accessCookieUser(cookie, keyOf(secret, `${allowed},other@seatora.test`), now)).toBeNull(); // allowlist changed
  expect(await accessCookieUser(cookie, keyOf(secret, "other@seatora.test"), now)).toBeNull();

  const [exp, user, sig] = cookie.split(".");
  expect(await accessCookieUser(`${exp}.user2.${sig}`, key, now)).toBeNull(); // another user's id
  expect(await accessCookieUser(`${Number(exp) + 86400}.${user}.${sig}`, key, now)).toBeNull(); // extended expiry
  expect(await accessCookieUser(`${exp}.${user}.${sig.replace(/^./, (c) => (c === "0" ? "1" : "0"))}`, key, now)).toBeNull();
  for (const bad of [undefined, "", "..", exp, `${exp}.${user}`, `${exp}.${user}.`, `${cookie}.x`, `x.${user}.${sig}`, `${exp}.a b.${sig}`, secret]) {
    expect(await accessCookieUser(bad, key, now)).toBeNull();
  }
});

it("follows ?next= only to same-origin paths", () => {
  const good = ["/decide", "/decide/choices?rank=12450&cat=OBC", "/decide/institutes/aiims-new-delhi#fees", "/", "/a//b", "/%2F%2Fevil.test"];
  for (const next of good) expect(safeNext(next)).toBe(next);
  const bad = [
    undefined, null, 42, ["/decide"], "", "decide", "//evil.test", "///evil.test", "/\\evil.test", "\\\\evil.test", "/decide\\..\\x",
    "https://evil.test", "http:/evil.test", "javascript:alert(1)", " /decide", "/\t/evil.test", "/\n/evil.test", "/decide\r\nSet-Cookie: x", "/\u0000",
    // dot segments that resolve to "//host"
    "/.//evil.example", "/decide/../..//evil.example", "/x/..//evil.example", "/%2e%2e//evil.example", "/%2E//evil.example",
  ];
  for (const next of bad) expect(safeNext(next)).toBe("/decide");
  // resolved and percent-encoded, so the Location header is always valid
  expect(safeNext("/decide/\u0905")).toBe("/decide/%E0%A4%85");
  expect(safeNext("/\u2014?q=\u0905#\u0905")).toBe("/%E2%80%94?q=%E0%A4%85#%E0%A4%85");
  expect(safeNext("/decide/./fees/../choices")).toBe("/decide/choices");
});

it("opens sign-up only with the configured invite code", async () => {
  const code = "0123456789abcdef";
  expect(await inviteMatches(code, code)).toBe(true);
  expect(await inviteMatches(` ${code} `, code)).toBe(true);
  for (const bad of ["", "0123456789abcdeF", code.slice(1), `${code}0`, undefined, 42]) expect(await inviteMatches(bad, code)).toBe(false);
  // unset or short: closed for everyone, whatever is typed
  expect(await inviteMatches("", "")).toBe(false);
  expect(await inviteMatches("short", "short")).toBe(false);
  expect(await inviteMatches("0123456789abcde", "0123456789abcde")).toBe(false);
});
