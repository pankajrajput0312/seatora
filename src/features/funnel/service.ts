import "server-only";
import { createHash, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { ALERT_AT, AID_COOKIE, fingerprintInput, isAid, routeOf, scrub, type EventName, type Placement } from "./lib";

// Funnel events, the device and network of a request, and error groups with alerts (docs/FUNNEL.md). Server only.

/** This browser's seatora_aid (src/middleware.ts sets it), or null. */
export async function deviceAid() {
  const v = (await cookies()).get(AID_COOKIE)?.value;
  return isAid(v) ? v : null;
}

/** The client's IP as the proxy reports it (Vercel sets x-real-ip). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** HMAC-SHA256(IP, SITE_ACCESS_SECRET), 16 hex characters: the same network matches, the IP can't be read back. Null without a secret or an IP. */
export async function ipHash() {
  const secret = process.env.SITE_ACCESS_SECRET;
  const ip = await clientIp();
  return secret && ip !== "unknown" ? createHmac("sha256", secret).update(ip).digest("hex").slice(0, 16) : null;
}

/** Runs `task` after the response is sent (next/server after); outside a request, now. Never throws. */
function later(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error("[funnel]", e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run();
  }
}

// ponytail: no cleanup job, no cron. The privacy page promises 12 months; when it matters, a monthly job (Vercel cron or by
// hand): DELETE FROM "FunnelEvent" WHERE "at" < now() - interval '12 months'; and ErrorGroup by "lastAt" the same.
type Meta = Record<string, string | number | boolean>;

/**
 * Records a funnel event once the response is out: never throws, never delays it. `aid` defaults to this request's
 * device cookie; `userId` to nobody. `meta` is small and never personal (amounts, true/false, a feature name).
 */
export async function track(name: EventName, e: { userId?: string | null; aid?: string | null; placement?: Placement | null; meta?: Meta } = {}) {
  const aid = e.aid !== undefined ? e.aid : await deviceAid().catch(() => null);
  later(() => db.funnelEvent.create({ data: { name, aid, userId: e.userId ?? null, placement: e.placement ?? null, meta: e.meta ?? {} } }));
}

/** sha1 of kind, route and message with ids and numbers stripped (lib.ts fingerprintInput). */
export const fingerprint = (kind: string, route: string, message: string) => createHash("sha1").update(fingerprintInput(kind, route, message)).digest("hex");

/**
 * Groups an error by fingerprint (one upsert: count + 1, last seen, last digest; a resolved group reopens) and, on its
 * 1st, 10th and 100th occurrence, posts to ALERT_WEBHOOK_URL. Message scrubbed, route without its query. Never throws.
 */
export async function recordError(e: { message: string; digest?: string | null; route: string; method?: string | null; kind: "server" | "client_error" }) {
  try {
    const message = scrub(e.message) || "(no message)";
    const route = routeOf(e.route);
    const id = fingerprint(e.kind, route, message);
    const digest = e.digest?.slice(0, 100) || null;
    const { count } = await db.errorGroup.upsert({
      where: { fingerprint: id },
      create: { fingerprint: id, kind: e.kind, message, route, lastDigest: digest },
      update: { count: { increment: 1 }, lastAt: new Date(), lastDigest: digest, resolvedAt: null },
      select: { count: true },
    });
    if (ALERT_AT.includes(count)) alert(`Seatora ${e.kind === "server" ? "server" : "browser"} error${count > 1 ? `, ${count} times now` : " (new)"}: ${message} · ${e.method ? `${e.method} ` : ""}${route}`);
  } catch (err) {
    console.error("recordError failed", err instanceof Error ? err.message : err);
  }
}

/** POSTs { text, content } (Slack reads text, Discord content) to ALERT_WEBHOOK_URL; 3 s timeout, fire-and-forget. Unset: nothing. */
function alert(text: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const msg = site ? `${text}\n${site}/decide/admin#errors-h` : text;
  const body = JSON.stringify({ text: msg, content: msg });
  later(() => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(3000) }));
}
