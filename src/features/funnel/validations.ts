import { z } from "zod";
import { CLIENT_EVENTS, PLACEMENTS } from "./lib";

/** POST /api/events: an event or a browser error. Unknown keys (an id, a user) are dropped: identity comes from cookies. */
export const clientEventSchema = z.union([
  z.object({ kind: z.literal("client_error"), message: z.string().max(2000), digest: z.string().max(100).optional(), route: z.string().max(500) }),
  z.object({ name: z.enum(CLIENT_EVENTS), placement: z.enum(PLACEMENTS).optional() }),
]);
