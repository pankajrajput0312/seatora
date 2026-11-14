"use server";

import { z } from "zod";
import { profileFromParams } from "@/features/decide/profile";
import { getOptionsByIds } from "@/features/decide/service";

const inputSchema = z.object({ ids: z.array(z.string().min(1).max(300)).max(1000), profile: z.string().max(2000) });

/**
 * Reach labels for saved choices, from the current data and the profile params in the page URL, so a label never
 * goes stale after she edits her rank or category. Null when there is no rank, the input is invalid or there's no data.
 * (A server action: a list can hold hundreds of ids, more than /api/v1/options/compare takes.)
 */
export async function liveReach(ids: string[], profile: string) {
  const input = inputSchema.safeParse({ ids, profile });
  const p = input.success ? profileFromParams(new URLSearchParams(input.data.profile)) : null;
  if (!input.success || !p) return null;
  try {
    const rows = await getOptionsByIds([...new Set(input.data.ids)], p);
    return Object.fromEntries(rows.map((o) => [o.id, { reach: o.reach, provisional: !!o.latest?.provisional }]));
  } catch (e) {
    console.error("[choices] live reach", e);
    return null;
  }
}
