import { z } from "zod";
import { askUser } from "@/features/ask/access";
import { deleteConversation, getConversation, stopTurn } from "@/features/ask/memory";

// One saved chat (owner only, her own chats only; 404 otherwise): GET its turns (a dropped or reloaded answer is read
// here while it finishes), DELETE it, POST { stop: requestId } to stop an answer still being written.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const notFound = () => Response.json({ ok: false, error: { code: "not_found" } }, { status: 404, headers });
const idOk = (id: string) => /^[a-z0-9]{10,40}$/.test(id);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await askUser();
  const { id } = await params;
  if (!user || !idOk(id)) return notFound();
  const c = await getConversation(id, user.id);
  return c ? Response.json({ ok: true, data: c }, { headers }) : notFound();
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await askUser();
  const { id } = await params;
  if (!user || !idOk(id)) return notFound();
  return (await deleteConversation(id, user.id)) ? Response.json({ ok: true }, { headers }) : notFound();
}

const stopSchema = z.object({ stop: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await askUser();
  const { id } = await params;
  if (!user || !idOk(id)) return notFound();
  const body = stopSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ ok: false, error: { code: "invalid" } }, { status: 400, headers });
  return Response.json({ ok: true, data: { stopped: await stopTurn(id, body.data.stop, user.id) } }, { headers });
}
