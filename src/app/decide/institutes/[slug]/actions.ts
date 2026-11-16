"use server";

import { z } from "zod";
import { canSeeResidents, hideResident, residentsDenied } from "@/features/decide/server/residents";

const idSchema = z.string().min(1).max(40);

/** "Hide" on the Residents tab: the row is never shown or returned again (re-imports keep it hidden). */
export async function hideResidentAction(id: string): Promise<{ ok: true; data: null } | { ok: false; error: string }> {
  const input = idSchema.safeParse(id);
  if (!input.success) return { ok: false, error: "invalid_id" };
  try {
    if (!(await canSeeResidents())) return { ok: false, error: "locked" };
    if (await residentsDenied("hide")) return { ok: false, error: "rate_limited" };
    const hidden = await hideResident(input.data);
    if (hidden) console.info("[residents] hidden", input.data);
    return hidden ? { ok: true, data: null } : { ok: false, error: "not_found" };
  } catch (e) {
    console.error("[residents] hide", e);
    return { ok: false, error: "unavailable" };
  }
}
