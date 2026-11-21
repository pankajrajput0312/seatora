import "server-only";
import { createPublicKey, verify } from "node:crypto";

// A Firebase ID token, checked as Firebase documents it (RS256 signed by a current securetoken key; aud, iss, sub, times),
// with node:crypto instead of firebase-admin. https://firebase.google.com/docs/auth/admin/verify-id-tokens
const CERTS = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let cached: { until: number; keys: Record<string, string> } | null = null;

async function googleCert(kid: string): Promise<string | undefined> {
  if (!cached || Date.now() > cached.until || !cached.keys[kid]) {
    const res = await fetch(CERTS, { cache: "no-store" });
    const age = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    cached = { until: Date.now() + age * 1000, keys: await res.json() };
  }
  return cached.keys[kid];
}

const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/**
 * The verified phone number (E.164) of a phone sign-in done in the last 10 minutes, or null. `certOf`, `now` (seconds):
 * tests only.
 */
export async function verifyPhoneToken(
  token: string,
  { projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, certOf = googleCert, now = Date.now() / 1000 } = {},
): Promise<string | null> {
  const [h, p, s, extra] = token.split(".");
  if (!projectId || !h || !p || !s || extra !== undefined) return null;
  try {
    const header = part(h);
    const c = part(p);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const pem = await certOf(header.kid);
    if (!pem || !verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey(pem), Buffer.from(s, "base64url"))) return null;
    const fresh = c.exp > now && c.iat <= now + 60 && c.auth_time <= now + 60 && c.auth_time > now - 600;
    const ours = c.aud === projectId && c.iss === `https://securetoken.google.com/${projectId}` && typeof c.sub === "string" && c.sub !== "";
    if (!fresh || !ours || c.firebase?.sign_in_provider !== "phone") return null;
    return typeof c.phone_number === "string" && /^\+[1-9]\d{7,14}$/.test(c.phone_number) ? c.phone_number : null;
  } catch {
    return null;
  }
}
