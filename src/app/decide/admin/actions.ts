"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { staffUser } from "@/features/auth/lib/session";
import { ROLES } from "@/features/plans/plans";
import { db } from "@/lib/db";

// /decide/admin's one mutation. Server Actions can be POSTed to any route, so it checks the caller itself.

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
