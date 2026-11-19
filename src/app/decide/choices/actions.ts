"use server";

import { z } from "zod";
import { canUseDecide } from "@/features/auth/lib/session";
import { profileFromParams } from "@/features/decide/profile";
import { choiceOptions } from "@/features/decide/service";
import { activeExam } from "@/features/exams/active";
import { exams } from "@/features/exams/registry";

const inputSchema = z.object({ ids: z.array(z.string().min(1).max(300)).max(1000), profile: z.string().max(2000) });

/**
 * Reach labels for saved choices, from the current data and the profile params in the page URL, so a label never
 * goes stale after she edits her rank or category, and each one's seats in the newest round's lists (`lists`: clear,
 * virtual, new; never added) with `below` (OptionRow.seatsBelow), as on Options, and its course and quota's terms
 * (`fees`, for the stat cells) and `hospital` (type, beds). Unknown ids are left out of `options`. With no rank in
 * `profile` only the terms and hospital (they don't depend on it): `reach` null, no seat lists or seats (her seat
 * categories are unknown). `latest` and `byYear`: its closings on her seat categories (OptionRow's; none without a rank), for the CSV; `r1` the latest year's R1 closing and `from` the label's first round (OptionRow.reachFrom). Null when the input is invalid, there's no data or no access (Server Actions can be POSTed
 * to any route, past the middleware).
 * (A server action: a list can hold hundreds of ids, more than /api/v1/options/compare takes.)
 */
export async function liveReach(ids: string[], profile: string) {
  const input = inputSchema.safeParse({ ids, profile });
  if (!input.success) return null;
  const p = profileFromParams(new URLSearchParams(input.data.profile));
  try {
    if (!(await canUseDecide())) return null;
    const uniq = [...new Set(input.data.ids)];
    const exam = await activeExam();
    const { lists, rows } = await choiceOptions(uniq, p, exam);
    const year = exams[exam].latestYear; // `latest`'s year: R1's closing beside it (r1)
    return {
      lists: p ? lists : [],
      options: Object.fromEntries(
        rows.map((o) => [o.id, { ...(p ? { reach: o.reach, provisional: o.reachProvisional, seats: o.seatsBy ?? {}, below: o.seatsBelow ?? [], ...(o.reachBy && o.seatsBelow?.length && { reachBy: o.reachBy }), latest: o.latest, byYear: o.byYear, r1: o.grid[year]?.R1?.closing ?? null, ...(o.reachFrom && { from: o.reachFrom }), ...(o.otherGroup && { otherGroup: true }) } : { reach: null, provisional: false, seats: {}, below: [], latest: null, byYear: {} }), fees: o.fees, hospital: o.hospital ?? null }]),
      ),
    };
  } catch (e) {
    console.error("[choices] live reach", e);
    return null;
  }
}
