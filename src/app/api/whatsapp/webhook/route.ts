import { after } from "next/server";
import { asTrustedServer } from "@/features/decide/server/catalog";
import { handleMessage } from "@/features/whatsapp/bot";
import { incoming, validSignature } from "@/features/whatsapp/cloud-api";

// WhatsApp Cloud API webhook (docs/WHATSAPP.md). GET: Meta's one-time verification. POST: messages, signed with the app
// secret (so Decide data is read as trusted server work, catalog.ts asTrustedServer); answered 200 at once (Meta redelivers anything slower) and replied to after the response.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ok = q.get("hub.mode") === "subscribe" && !!process.env.WHATSAPP_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new Response(q.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  for (const m of incoming(body)) after(() => asTrustedServer(() => handleMessage(m)).catch((e) => console.error("[whatsapp] failed", e instanceof Error ? e.message : e)));
  return new Response("ok");
}
