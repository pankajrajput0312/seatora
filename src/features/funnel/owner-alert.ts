import "server-only";
import { formatPaise } from "@/features/referrals/lib";
import { sendTemplate, sendText } from "@/features/whatsapp/cloud-api";
import { db } from "@/lib/db";
import type { EventName } from "./lib";

// The owner's WhatsApp (OWNER_WHATSAPP, 91…) hears of every new account and every upgrade, from track() (service.ts).

type Meta = Record<string, string | number | boolean>;

/** The events that message the owner: a new account (email or WhatsApp) and every upgrade (free claim, payment, coupon). */
export const OWNER_ALERTS: ReadonlySet<EventName> = new Set<EventName>(["signup_done", "free_claimed", "payment_paid"]);

/** One line for the event: `who` is "Name (email or +number)"; `coupon` the code she used, if any. */
export function ownerLine(name: EventName, who: string, meta: Meta, coupon?: string | null) {
  if (name === "signup_done") return `New sign-up on Seatora: ${who}${meta.via === "whatsapp" ? ", on WhatsApp" : meta.referred ? ", invited by a friend" : ""}.`;
  if (name === "free_claimed") return `Upgrade on Seatora: ${who} took the free Season Pass.`;
  const amount = Number(meta.amount ?? 0);
  return amount
    ? `Payment on Seatora: ${who} paid ${formatPaise(amount)} for the Season Pass${coupon ? ` with coupon ${coupon}` : meta.referred ? ", referred" : ""}.`
    : `Upgrade on Seatora: ${who} got the Season Pass free${coupon ? ` with coupon ${coupon}` : ""}.`;
}

/** Sends the line: free text inside his 24-hour window, else the approved template (WHATSAPP_TEMPLATE, seatora_update). */
export async function alertOwner(name: EventName, userId: string | null | undefined, meta: Meta = {}) {
  const to = process.env.OWNER_WHATSAPP;
  if (!to || !OWNER_ALERTS.has(name)) return;
  const u = userId ? await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } }) : null;
  // A WhatsApp account's email is a placeholder (whatsapp/account.ts): its number says who it is.
  const who = u ? `${u.name} (${u.phone && u.email.endsWith("@whatsapp.seatora.co.in") ? `+${u.phone}` : u.email})` : "someone";
  const coupon = name === "payment_paid" && meta.coupon && userId
    ? (await db.couponRedemption.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { coupon: { select: { code: true } } } }))?.coupon.code
    : null;
  const line = ownerLine(name, who, meta, coupon);
  if (!(await sendText(to, line))) await sendTemplate(to, process.env.WHATSAPP_TEMPLATE || "seatora_update", [line]);
}
