"use server";

import { z } from "zod";
import { canUseDecide } from "@/features/auth/lib/session";
import { profileFromParams } from "@/features/decide/profile";
import { getOptionsByIds, optionSeats } from "@/features/decide/service";

const inputSchema = z.object({ ids: z.array(z.string().min(1).max(300)).max(1000), profile: z.string().max(2000) });

/**
 * Reach labels for saved choices, from the current data and the profile params in the page URL, so a label never
 * goes stale after she edits her rank or category, and each one's seats in the newest round's lists (`lists`: clear,
 * virtual, new; never added), as on Options. Unknown ids are left out of `options`. Null when there is no rank, the input is invalid, there's no data or
 * no access (Server Actions can be POSTed to any route, past the middleware).
 * (A server action: a list can hold hundreds of ids, more than /api/v1/options/compare takes.)
 */
export async function liveReach(ids: string[], profile: string) {
  const input = inputSchema.safeParse({ ids, profile });
  const p = input.success ? profileFromParams(new URLSearchParams(input.data.profile)) : null;
  if (!input.success || !p) return null;
  try {
    if (!(await canUseDecide())) return null;
    const uniq = [...new Set(input.data.ids)];
    const [rows, s] = await Promise.all([getOptionsByIds(uniq, p), optionSeats(uniq, p)]);
    return { lists: s.lists, options: Object.fromEntries(rows.map((o) => [o.id, { reach: o.reach, provisional: o.reachProvisional, seats: s.seats[o.id] ?? {} }])) };
  } catch (e) {
    console.error("[choices] live reach", e);
    return null;
  }
}
