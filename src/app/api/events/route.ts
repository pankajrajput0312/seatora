import { getCurrentUser } from "@/features/auth/lib/session";
import { isBot } from "@/features/funnel/lib";
import { clientEventSchema } from "@/features/funnel/validations";
import { deviceAid, recordError, track } from "@/features/funnel/service";
import { allow } from "@/lib/rate-limit";

// POST /api/events (navigator.sendBeacon, features/funnel/components/beacon.tsx): a whitelisted funnel event, or a
// browser error from an error.tsx boundary. Who it is comes from the cookies (seatora_aid, the session), never the body.
// Bots are ignored. 60 events and 10 errors a minute per device. 204; 400 for anything else. docs/FUNNEL.md.
export const dynamic = "force-dynamic";

const none = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (isBot(req.headers.get("user-agent"))) return none();
  const raw = await req.text();
  if (raw.length > 4000) return none(413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return none(400);
  }
  const body = clientEventSchema.safeParse(json);
  if (!body.success) return none(400);
  const aid = await deviceAid();
  const who = aid ?? req.headers.get("x-real-ip") ?? "anon";
  if ("kind" in body.data) {
    if (!allow(`events-error:${who}`, 10, 60_000)) return none(429);
    await recordError({ ...body.data, kind: "client_error" });
    return none();
  }
  if (!allow(`events:${who}`, 60, 60_000)) return none(429);
  const user = await getCurrentUser().catch(() => null);
  await track(body.data.name, { aid, userId: user?.id ?? null, placement: body.data.placement ?? null });
  return none();
}
