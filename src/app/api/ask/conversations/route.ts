import { askUser } from "@/features/ask/access";
import { listConversations } from "@/features/ask/memory";

// Her saved Ask chats, newest first (owner only; 404 for anyone else). Chats older than 30 days are deleted here.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET() {
  const user = await askUser();
  if (!user) return Response.json({ ok: false, error: { code: "not_found" } }, { status: 404, headers });
  return Response.json({ ok: true, data: await listConversations(user.id) }, { headers });
}
