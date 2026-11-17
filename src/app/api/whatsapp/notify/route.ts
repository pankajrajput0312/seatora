import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sendTemplate, sendText } from "@/features/whatsapp/cloud-api";

// Owner alerts on WhatsApp (docs/WHATSAPP.md): POST { to, text } inside her 24-hour window, or { to, template, params }
// (an approved template) outside it. Guarded by the x-notify-secret header = WHATSAPP_NOTIFY_SECRET; 404 when unset.

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.strictObject({ to: z.string().regex(/^\d{10,15}$/), text: z.string().trim().min(1).max(4000) }),
  z.strictObject({ to: z.string().regex(/^\d{10,15}$/), template: z.string().regex(/^[a-z0-9_]{1,512}$/), params: z.array(z.string().max(1024)).max(10).default([]), language: z.string().max(10).optional() }),
]);

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_NOTIFY_SECRET;
  if (!secret || secret.length < 32) return new Response("not found", { status: 404 });
  if (!same(req.headers.get("x-notify-secret") ?? "", secret)) return new Response("forbidden", { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;
  const ok = "text" in b ? await sendText(b.to, b.text) : await sendTemplate(b.to, b.template, b.params, b.language);
  // Meta's reason (e.g. outside the 24-hour window: use a template) is in the function log as "[whatsapp] send failed".
  return Response.json({ ok }, { status: ok ? 200 : 502 });
}
