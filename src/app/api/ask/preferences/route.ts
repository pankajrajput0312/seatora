import { z } from "zod";
import { askUser } from "@/features/ask/access";
import { getPreferences, PREF_KEYS, setPreference } from "@/features/ask/memory";

// "What Seatora remembers" (owner only; 404 otherwise): GET her saved preferences, PUT { key, value } to change one
// (an empty value forgets it).
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const notFound = () => Response.json({ ok: false, error: { code: "not_found" } }, { status: 404, headers });

export async function GET() {
  const user = await askUser();
  if (!user) return notFound();
  return Response.json({ ok: true, data: await getPreferences(user.id) }, { headers });
}

const putSchema = z.object({ key: z.enum(PREF_KEYS), value: z.string().max(300) });
export async function PUT(req: Request) {
  const user = await askUser();
  if (!user) return notFound();
  const body = putSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ ok: false, error: { code: "invalid", message: body.error.issues[0]?.message } }, { status: 400, headers });
  await setPreference(user.id, body.data.key, body.data.value);
  return Response.json({ ok: true, data: await getPreferences(user.id) }, { headers });
}
