"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { getCurrentUser, isOwner } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { REQUEST_STATUSES, featureRequestSchema, type FeatureRequestInput, type FeatureRequestResult } from "./validations";

const DAY_MS = 24 * 60 * 60 * 1000;
const PER_DAY = 10;
// Signed out: 5 a day per IP, in memory (never stored, as the privacy notice says), then 100 a day for everyone signed out
// together as a backstop. ponytail: the per-IP count is per server instance and resets on a cold start; a database counter
// keyed by a hashed IP if one sender ever gets through enough instances to fill the shared cap.
const IP_PER_DAY = 5;
const PUBLIC_PER_DAY = 100;
const orEmail = siteConfig.contactEmail ? ` or email us at ${siteConfig.contactEmail}` : "";

/** Prisma errors can quote the query's data (message, email): log only the error's kind. */
const logFailure = (where: string, err: unknown) =>
  console.error(`${where} failed`, (err as { code?: string })?.code ?? (err instanceof Error ? err.name : "unknown"));

/** Public: anyone may send one (the site's contact page too). Signed in, it's linked to the account. */
export async function submitFeatureRequest(input: FeatureRequestInput): Promise<FeatureRequestResult> {
  // x-real-ip is set by Vercel and most proxies and can't be spoofed through them (as in the waitlist).
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip && !allow(`request:${ip}`, 3)) return { ok: false, error: "Too many requests. Please wait a minute and try again." };

  const parsed = featureRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { kind, message, email, page, website } = parsed.data;
  // Pretend success to bots so they don't retry.
  if (website) return { ok: true };

  try {
    const user = await getCurrentUser();
    if (!user && ip && !allow(`request-day:${ip}`, IP_PER_DAY, DAY_MS))
      return { ok: false, error: `You've sent ${IP_PER_DAY} requests today. Please try again tomorrow${orEmail}.` };
    const replyTo = email || user?.email;
    if (!replyTo) return { ok: false, error: "Enter your email so we can reply." };
    // The daily caps live in the database, so they hold across server instances: per account, and for everyone signed out.
    const createdAt = { gte: new Date(Date.now() - DAY_MS) };
    if (user && (await db.featureRequest.count({ where: { userId: user.id, createdAt } })) >= PER_DAY)
      return { ok: false, error: "You've sent 10 requests today. Please try again tomorrow." };
    if (!user && (await db.featureRequest.count({ where: { userId: null, createdAt } })) >= PUBLIC_PER_DAY)
      return { ok: false, error: `We've had too many requests today. Please try again tomorrow${orEmail}.` };

    await db.featureRequest.create({ data: { kind, message, email: replyTo, page: page || null, userId: user?.id ?? null } });
    return { ok: true };
  } catch (err) {
    logFailure("submitFeatureRequest", err);
    return { ok: false, error: "We couldn't save your request. Please try again in a moment." };
  }
}

const statusSchema = z.object({ id: z.string().min(1).max(64), status: z.enum(REQUEST_STATUSES) });

/** Owner only (SEATORA_OWNER_EMAILS). Server Actions can be POSTed to any route, so this checks for itself. */
export async function setRequestStatus(id: string, status: string): Promise<FeatureRequestResult> {
  if (!(await isOwner())) return { ok: false, error: "You don't have access to this." };
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  try {
    const { count } = await db.featureRequest.updateMany({ where: { id: parsed.data.id }, data: { status: parsed.data.status } });
    return count ? { ok: true } : { ok: false, error: "That request no longer exists." };
  } catch (err) {
    logFailure("setRequestStatus", err);
    return { ok: false, error: "We couldn't update the request. Please try again." };
  }
}
