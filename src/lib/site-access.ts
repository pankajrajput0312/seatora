// Access gate (src/middleware.ts): /decide and /api/v1 need a signed-in account (any account with SEATORA_OPEN_ACCESS=1,
// else one on SEATORA_ALLOWED_EMAILS), proven at the edge by the seatora_access cookie that sign-in sets. Web Crypto only, so this runs in the Edge middleware and in Node
// tests alike. See docs/ARCHITECTURE.md "Access gate".

export const ACCESS_COOKIE = "seatora_access";
export const ACCESS_MAX_AGE_S = 60 * 60 * 24 * 30; // also the session's lifetime (features/auth/lib/session.ts)
const MIN_SECRET_LENGTH = 32;

/** SEATORA_ALLOWED_EMAILS: comma-separated, trimmed, lowercased, empties dropped, deduplicated and sorted. */
export function parseAllowlist(raw: string | undefined) {
  return [...new Set((raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
}

/** SEATORA_OPEN_ACCESS=1: the site is open to everyone: anyone may sign up (no invite code), every account gets Decide. */
export const openAccess = (raw = process.env.SEATORA_OPEN_ACCESS) => raw?.trim() === "1";

export const isAllowed = (email: string, allowlist = parseAllowlist(process.env.SEATORA_ALLOWED_EMAILS)) =>
  allowlist.includes(email.trim().toLowerCase());

/**
 * "off": development with neither variable set (private paths open). "closed": private paths are always denied.
 * "on" with `open`: every signed-in account gets in (SEATORA_OPEN_ACCESS=1, needs only the secret), else the allowlist's.
 */
export type SiteGate = { state: "off" } | { state: "closed" } | { state: "on"; key: string; open: boolean; allowlist: string[] };

export function siteGate(
  secret = process.env.SITE_ACCESS_SECRET,
  allowed = process.env.SEATORA_ALLOWED_EMAILS,
  production = process.env.NODE_ENV === "production",
  open = openAccess(),
): SiteGate {
  const allowlist = parseAllowlist(allowed);
  const strong = !!secret && secret.length >= MIN_SECRET_LENGTH;
  // The mode and allowlist are part of the HMAC key, so switching either voids every cookie.
  if (strong && open) return { state: "on", key: `${secret}|*open*`, open, allowlist };
  if (strong && allowlist.length) return { state: "on", key: `${secret}|${allowlist.join(",")}`, open, allowlist };
  // Half-configured (or a short secret) is a mistake: fail closed even in development.
  return secret || allowlist.length || open || production ? { state: "closed" } : { state: "off" };
}

/** May this account sign in and use Decide: any account in open mode, else one on the allowlist. */
export const isMember = (email: string, open = openAccess(), allowlist = parseAllowlist(process.env.SEATORA_ALLOWED_EMAILS)) =>
  open || isAllowed(email, allowlist);

const enc = new TextEncoder();

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const signature = async (key: string, exp: string, userId: string) => hex(await hmac(key, `site-access:${exp}:${userId}`));

/** Cookie value `<expiry seconds>.<userId>.<HMAC>`: neither the expiry nor the user can be changed. `key` = siteGate().key. */
export async function accessCookie(key: string, userId: string, now = Date.now()) {
  const exp = String(Math.floor(now / 1000) + ACCESS_MAX_AGE_S);
  return `${exp}.${userId}.${await signature(key, exp, userId)}`;
}

/** The cookie's user id when it is genuine and unexpired, else null. Constant-time over the fixed-length signature. */
export async function accessCookieUser(value: string | undefined, key: string, now = Date.now()) {
  const [exp, userId, sig, extra] = value?.split(".") ?? [];
  if (!exp || !userId || !sig || extra !== undefined || !/^\d{1,12}$/.test(exp) || !/^[\w-]{1,64}$/.test(userId)) return null;
  if (Number(exp) * 1000 <= now) return null;
  return equal(enc.encode(sig), enc.encode(await signature(key, exp, userId))) ? userId : null;
}

/**
 * Where `?next=` may send a user after sign-in: a same-origin path starting with exactly one "/". No "//" or "/\"
 * (protocol-relative), backslashes, whitespace or control characters (browsers strip or fold them). Then resolved, so
 * dot segments can't collapse to "//host" ("/.//evil", "/a/..//evil"), and returned percent-encoded (a raw non-ASCII
 * character in the Location header is a 500).
 */
export function safeNext(raw: unknown) {
  if (typeof raw !== "string" || !/^\/(?![/\\])/.test(raw) || /[\\\s\u0000-\u001f\u007f]/.test(raw)) return "/decide";
  const u = new URL(raw, "http://x");
  return u.origin === "http://x" && !u.pathname.startsWith("//") ? u.pathname + u.search + u.hash : "/decide";
}

/**
 * Sign-up also needs SEATORA_INVITE_CODE: there is no email verification, so an allowlisted address alone proves
 * nothing. Unset or shorter than 16 characters: sign-up is closed. Compared as SHA-256 digests (constant time).
 */
export async function inviteMatches(code: unknown, expected = process.env.SEATORA_INVITE_CODE ?? "") {
  if (typeof code !== "string" || expected.trim().length < 16) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s.trim())));
  return equal(await digest(code), await digest(expected));
}
