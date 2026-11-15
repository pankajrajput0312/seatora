import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, isOwner } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { REQUEST_KINDS, REQUEST_STATUSES, type FeatureRequestRow } from "./validations";

// Reads for server components. The mutations are Server Actions in actions.ts.

const PAGE_SIZE = 50;
const select = { id: true, kind: true, message: true, email: true, page: true, status: true, createdAt: true } as const;
type Selected = Prisma.FeatureRequestGetPayload<{ select: typeof select }>;
// kind and status are written only through the Zod enums, so the cast holds.
const toRow = (r: Selected) => ({ ...r, createdAt: r.createdAt.toISOString() }) as FeatureRequestRow;

/** The signed-in user's own requests, newest first (50 at most). Signed out: none. */
export async function listMyRequests(): Promise<FeatureRequestRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db.featureRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, select });
  return rows.map(toRow);
}

// Lenient like the pages' search params: a bad filter is dropped, a bad page is 1.
const listSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional().catch(undefined),
  kind: z.enum(REQUEST_KINDS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

/**
 * Owner only: every request, newest first, 50 a page. null for anyone else (the page answers notFound()). `account`: the
 * signed-in sender's account email (null: sent signed out, or the account was since deleted), since `email` is whatever
 * the sender typed.
 */
export async function listAllRequests(filters: { status?: string; kind?: string; page?: number | string } = {}) {
  if (!(await isOwner())) return null;
  const { status, kind, page } = listSchema.parse(filters);
  const where = { status, kind };
  const [rows, total] = await Promise.all([
    db.featureRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { ...select, user: { select: { email: true } } },
    }),
    db.featureRequest.count({ where }),
  ]);
  return { rows: rows.map(({ user, ...r }) => ({ ...toRow(r), account: user?.email ?? null })), total, page, pageSize: PAGE_SIZE };
}
