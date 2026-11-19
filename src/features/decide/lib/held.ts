// "I already hold a seat" (pure, client-safe): her current seat as an option id and the round she joined it in, its
// `held` URL param, and the courses that beat it by her own course order (Options' and Suggest's "Upgrades only").
import { z } from "zod";
import { rounds } from "../types";

/** Her seat: an option id (types.ts optionId, "collegeKey~degree~SPECIALTY~quota") and the round she joined it in. */
export const heldSchema = z.object({ id: z.string().max(300).regex(/^[^~]+~[^~]+~[^~]+~[^~]+$/), round: z.enum(rounds) });
export type Held = z.infer<typeof heldSchema>;

/** The `held` param: "R1~<option id>". */
export const heldParam = (h: Held) => `${h.round}~${h.id}`;
/** The `held` param read back; null when it isn't one. */
export function heldFromParam(v: string | null | undefined): Held | null {
  const i = v?.indexOf("~") ?? -1;
  const r = i > 0 ? heldSchema.safeParse({ round: v!.slice(0, i), id: v!.slice(i + 1) }) : null;
  return r?.success ? r.data : null;
}

/** The seat's college key, course and quota, from its id. */
export function heldParts(h: Pick<Held, "id">) {
  const [college, degree, specialty, quota] = h.id.split("~");
  return { college, degree, specialty, quota };
}
