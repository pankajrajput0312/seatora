"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { newResetToken } from "@/features/auth/lib/reset";
import { staffUser } from "@/features/auth/lib/session";
import { couponCreateSchema, couponEditSchema } from "@/features/payments/coupons";
import { ROLES } from "@/features/plans/plans";
import { db } from "@/lib/db";

// /decide/admin's mutations. Server Actions can be POSTed to any route, so each checks the caller itself.

const inputSchema = z.object({
  userId: z.string().min(1).max(40),
  role: z.enum(ROLES),
  /** YYYY-MM-DD: Premium through the end of that day in India; empty clears it. */
  premiumUntil: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  notes: z.string().trim().max(500).default(""),
  /** The page's search, to come back to. */
  q: z.string().max(100).default(""),
});

/**
 * Sets an account's role, Season Pass expiry and notes, with an AdminAudit row (before and after). Only an owner may
 * grant or change OWNER and ADMIN; nobody changes their own role. Back to the admin page with ?msg=.
 */
export async function setUserAccess(form: FormData) {
  const me = await staffUser();
  if (!me) redirect("/decide");
  const parsed = inputSchema.safeParse(Object.fromEntries(form));
  const back = (msg: string) => redirect(`/decide/admin?${new URLSearchParams({ ...(parsed.success && parsed.data.q && { q: parsed.data.q }), msg })}`);
  if (!parsed.success) back("invalid");
  const { userId, role, premiumUntil, notes } = parsed.data!;
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true, premiumUntil: true, notes: true } });
  if (!target) back("not_found");
  const staffRoles = ["OWNER", "ADMIN"];
  if (userId === me.id && role !== me.role) back("own_role");
  if (me.role !== "OWNER" && (staffRoles.includes(role) || staffRoles.includes(target!.role))) back("owner_only");
  const after = { role, premiumUntil: premiumUntil ? new Date(`${premiumUntil}T23:59:59.999+05:30`) : null, notes: notes || null };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: after }),
    db.adminAudit.create({ data: { actorId: me.id, targetId: userId, action: "set_access", before: JSON.parse(JSON.stringify(target)), after: JSON.parse(JSON.stringify(after)) } }),
  ]);
  back("saved");
}

const settleSchema = z.object({
  referrerId: z.string().min(1).max(40),
  /** The earnings shown on the page, comma-separated: only these change (not one that arrived since). */
  ids: z.string().max(5000).transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.string().min(1).max(40)).min(1).max(200)),
  to: z.enum(["paid_out", "void"]),
  /** The UPI reference, or why it was voided. */
  note: z.string().trim().max(500).default(""),
});

/**
 * Referrals: marks a referrer's pending earnings paid out (paidOutAt now) or void, with the note and an AdminAudit row.
 * Owner or admin only. Back to the admin page's Referrals section with ?msg=.
 */
export async function settleReferrals(form: FormData) {
  const me = await staffUser();
  if (!me) redirect("/decide");
  const parsed = settleSchema.safeParse(Object.fromEntries(form));
  const back = (msg: string) => redirect(`/decide/admin?${new URLSearchParams({ msg })}#referrals-h`);
  if (!parsed.success) back("invalid");
  const { referrerId, ids, to, note } = parsed.data!;
  const where = { id: { in: ids }, referrerId, status: "pending" };
  const before = await db.referralEarning.findMany({ where, select: { id: true, amount: true, status: true } });
  if (!before.length) back("nothing_pending");
  const after = { status: to, paidOutAt: to === "paid_out" ? new Date() : null, note: note || null };
  await db.$transaction([
    db.referralEarning.updateMany({ where: { ...where, id: { in: before.map((e) => e.id) } }, data: after }),
    db.adminAudit.create({ data: { actorId: me.id, targetId: referrerId, action: `referral_${to}`, before: { earnings: before }, after: JSON.parse(JSON.stringify(after)) } }),
  ]);
  back(to === "paid_out" ? "paid_out" : "voided");
}

/** Errors: marks a group resolved (a new occurrence reopens it), with an AdminAudit row. Owner or admin only. */
export async function resolveError(form: FormData) {
  const me = await staffUser();
  if (!me) redirect("/decide");
  const fingerprint = z.string().regex(/^[0-9a-f]{40}$/).safeParse(form.get("fingerprint"));
  const back = (msg: string) => redirect(`/decide/admin?${new URLSearchParams({ msg })}#errors-h`);
  if (!fingerprint.success) back("invalid");
  const at = new Date();
  await db.$transaction([
    db.errorGroup.updateMany({ where: { fingerprint: fingerprint.data }, data: { resolvedAt: at } }),
    db.adminAudit.create({ data: { actorId: me.id, targetId: fingerprint.data!, action: "error_resolved", before: {}, after: { resolvedAt: at.toISOString() } } }),
  ]);
  back("resolved");
}

const backToCoupons = (msg: string) => redirect(`/decide/admin?${new URLSearchParams({ msg })}#coupons-h`);
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

/** Coupons: a new coupon (docs/PAYMENTS.md "Coupons"), with an AdminAudit row. Owner or admin only. */
export async function createCoupon(form: FormData) {
  const me = await staffUser();
  if (!me) redirect("/decide");
  const parsed = couponCreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) backToCoupons("invalid");
  const { note, ...rest } = parsed.data!;
  const data = { ...rest, note: note || null };
  try {
    await db.$transaction(async (tx) => {
      const c = await tx.coupon.create({ data });
      await tx.adminAudit.create({ data: { actorId: me.id, targetId: c.id, action: "coupon_create", before: {}, after: json(data) } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") backToCoupons("coupon_exists");
    throw e;
  }
  backToCoupons("coupon_saved");
}

/** Coupons: edit maxUses, allowedEmail and validUntil, or (its own form) only activate / deactivate, with an AdminAudit row. */
export async function updateCoupon(form: FormData) {
  const me = await staffUser();
  if (!me) redirect("/decide");
  const parsed = couponEditSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) backToCoupons("invalid");
  const { id, active, ...rest } = parsed.data!;
  const select = { maxUses: true, allowedEmail: true, validUntil: true, active: true };
  const before = await db.coupon.findUnique({ where: { id }, select });
  if (!before) backToCoupons("invalid");
  const data = active ? { active: active === "1" } : rest;
  await db.$transaction([
    db.coupon.update({ where: { id }, data }),
    db.adminAudit.create({ data: { actorId: me.id, targetId: id, action: "coupon_update", before: json(before), after: json(data) } }),
  ]);
  backToCoupons("coupon_saved");
}

/**
 * Accounts: a one-time password reset link for her (lib/reset.ts; an hour, her older links void), with an AdminAudit row
 * (never the token). Returned once, to show with a Copy button; only an owner makes one for an owner or admin.
 */
export async function createResetLink(userId: string): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; error: string }> {
  const me = await staffUser();
  if (!me) return { ok: false, error: "Only an owner or admin can do this." };
  const id = z.string().min(1).max(40).safeParse(userId);
  const target = id.success ? await db.user.findUnique({ where: { id: id.data }, select: { role: true } }) : null;
  if (!target) return { ok: false, error: "No such account." };
  if (me.role !== "OWNER" && ["OWNER", "ADMIN"].includes(target.role)) return { ok: false, error: "Only an owner can reset an owner's or admin's password." };
  const { token, expiresAt, writes } = newResetToken(id.data!);
  await db.$transaction([...writes, db.adminAudit.create({ data: { actorId: me.id, targetId: id.data!, action: "password_reset_link", before: {}, after: { expiresAt: expiresAt.toISOString() } } })]);
  return { ok: true, link: `${siteConfig.url}/reset?${new URLSearchParams({ token })}`, expiresAt: expiresAt.toISOString() };
}
