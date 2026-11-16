import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PLANS } from "@/features/payments/plans";
import { db } from "@/lib/db";
import { CODE_ALPHABET, discountedPrice, earningFor, firstName, referralCodeSchema } from "./lib";

// Referrals' reads and writes (docs/REFERRALS.md). The discount and the earning are decided here, never by the browser.

/** The referrer behind a code: id and first name (never the email). Null for a malformed or unknown code. */
export async function referrerByCode(raw: unknown) {
  const code = referralCodeSchema.safeParse(raw);
  if (!code.success) return null;
  const u = await db.user.findUnique({ where: { referralCode: code.data }, select: { id: true, name: true } });
  return u && { id: u.id, name: firstName(u.name), code: code.data };
}

/** Her code, made the first time she needs it (7 characters; a clash with another code retries). Never changed after. */
export async function ensureReferralCode(userId: string) {
  for (let i = 0; i < 5; i++) {
    const { referralCode } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
    if (referralCode) return referralCode;
    const code = Array.from({ length: 7 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    try {
      await db.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new Error("Couldn't make a referral code");
}

export type Quote = { listAmount: number; amount: number; discount: number; referrerId: string | null; inviter: string | null; error: string | null };

/**
 * What the Season Pass costs this buyer, in paise. 20% off when a referrer applies: her own referredById first, else
 * `code` (typed at checkout, or the /r/ cookie). Never her own code, and only before her first paid payment. `error`
 * explains why a given code gave nothing. `buyerId` null (signed out): only the code is checked, for the price shown.
 */
export async function quote(buyerId: string | null, code?: string | null): Promise<Quote> {
  const listAmount = PLANS.season_pass.amount;
  const full = (error: string | null = null): Quote => ({ listAmount, amount: listAmount, discount: 0, referrerId: null, inviter: null, error: code ? error : null });
  const own = buyerId ? (await db.user.findUnique({ where: { id: buyerId }, select: { referredById: true } }))?.referredById : null;
  const ref = own ? await db.user.findUnique({ where: { id: own }, select: { id: true, name: true } }) : code ? await referrerByCode(code) : null;
  if (!ref) return full("This coupon or invite code isn't valid.");
  if (ref.id === buyerId) return full("That's your own code: share it with friends instead.");
  if (buyerId && (await db.payment.findFirst({ where: { userId: buyerId, status: "paid" }, select: { id: true } }))) {
    return full("The referral discount is for a first purchase only.");
  }
  const amount = discountedPrice(listAmount);
  return { listAmount, amount, discount: listAmount - amount, referrerId: ref.id, inviter: firstName(ref.name), error: null };
}

/**
 * In markPaid's transaction, for a payment with a referrer: 20% of what was paid, pending payout. Once per payment
 * (markPaid lets one call through; the unique paymentId backs it up without failing the transaction).
 */
export async function recordEarning(tx: Prisma.TransactionClient, p: { id: string; userId: string; amount: number; referrerId: string | null }) {
  if (!p.referrerId) return;
  await tx.referralEarning.createMany({
    data: [{ referrerId: p.referrerId, paymentId: p.id, buyerId: p.userId, amount: earningFor(p.amount) }],
    skipDuplicates: true,
  });
}

/** A refunded payment (Razorpay webhook): its pending earning becomes void, with the refund in the note. */
export async function voidRefundedEarning(razorpayPaymentId: string, refundId?: string) {
  const { count } = await db.referralEarning.updateMany({
    where: { status: "pending", payment: { razorpayPaymentId } },
    data: { status: "void", note: `Refunded ${refundId ?? ""} ${new Date().toISOString()}`.replace(/\s+/g, " ") },
  });
  if (count) console.info(JSON.stringify({ event: "referral_voided", razorpayPaymentId, refundId }));
}

/** /decide/refer: her code (made now if new), UPI ID, friends signed up through her, friends who paid, earnings (paise). */
export async function myReferrals(userId: string) {
  const [code, me, signedUp, rows] = await Promise.all([
    ensureReferralCode(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { payoutUpi: true } }),
    db.user.count({ where: { referredById: userId } }),
    db.referralEarning.groupBy({ by: ["status"], where: { referrerId: userId }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const of = (s: string) => rows.find((r) => r.status === s);
  return {
    code,
    payoutUpi: me.payoutUpi,
    signedUp,
    paid: (of("pending")?._count._all ?? 0) + (of("paid_out")?._count._all ?? 0),
    pending: of("pending")?._sum.amount ?? 0,
    paidOut: of("paid_out")?._sum.amount ?? 0,
  };
}

/** /decide/admin: pending earnings grouped by referrer (with her UPI and the buyers' emails), and the totals. */
export async function referralAdmin() {
  const [pending, byStatus, referred] = await Promise.all([
    db.referralEarning.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, amount: true, createdAt: true, referrerId: true, referrer: { select: { email: true, payoutUpi: true } }, payment: { select: { user: { select: { email: true } } } } },
    }),
    db.referralEarning.groupBy({ by: ["status"], _sum: { amount: true }, _count: { _all: true } }),
    db.user.count({ where: { referredById: { not: null } } }),
  ]);
  const groups = new Map<string, { referrerId: string; email: string; upi: string | null; amount: number; earnings: { id: string; amount: number; buyer: string; createdAt: Date }[] }>();
  for (const e of pending) {
    const g = groups.get(e.referrerId) ?? { referrerId: e.referrerId, email: e.referrer.email, upi: e.referrer.payoutUpi, amount: 0, earnings: [] };
    g.amount += e.amount;
    g.earnings.push({ id: e.id, amount: e.amount, buyer: e.payment.user.email, createdAt: e.createdAt });
    groups.set(e.referrerId, g);
  }
  const total = (s: string) => ({ amount: byStatus.find((r) => r.status === s)?._sum.amount ?? 0, n: byStatus.find((r) => r.status === s)?._count._all ?? 0 });
  return { groups: [...groups.values()], pending: total("pending"), paidOut: total("paid_out"), void: total("void"), referred };
}
