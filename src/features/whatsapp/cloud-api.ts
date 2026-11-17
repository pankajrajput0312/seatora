import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// WhatsApp Cloud API (Meta): the webhook's signature and body, and sending text, buttons and lists. Env:
// WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN (docs/WHATSAPP.md).

const SITE = "https://www.seatora.co.in";

/** Meta signs the raw body with the app secret (X-Hub-Signature-256: sha256=<hex>). */
export function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

const messageSchema = z.object({
  id: z.string(),
  from: z.string().regex(/^\d{8,15}$/),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string(), description: z.string().optional() }).optional(),
    })
    .optional(),
});
const webhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(messageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type Incoming = { id: string; phone: string; name: string | null; text: string | null };

/** The messages in a webhook body (status updates have none). A tapped button or list row reads as its title. */
export function incoming(body: unknown): Incoming[] {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.entry.flatMap((e) =>
    e.changes.flatMap(({ value }) =>
      (value.messages ?? []).map((m) => {
        const pick = m.interactive?.list_reply ?? m.interactive?.button_reply;
        const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        return { id: m.id, phone: m.from, name, text: (m.text?.body ?? pick?.title ?? "").trim() || null };
      }),
    ),
  );
}

async function post(payload: object): Promise<boolean> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!r.ok) console.error("[whatsapp] send failed", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

/** An approved template (needed outside the 24-hour window), its body's {{1}}, {{2}}… filled in order. */
export const sendTemplate = (to: string, name: string, params: string[], language = "en") =>
  post({ to, type: "template", template: { name, language: { code: language }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] } });

/**
 * Markdown (the assistant's) → WhatsApp: *bold*, headings as bold lines, Seatora links as "text: full URL". WhatsApp
 * has no tables or links-with-text; the channel rules ask for neither, this only keeps a stray one readable.
 */
export function toWhatsApp(md: string) {
  // Tables: the header and |---| rows go, each row becomes one line with its cells joined by " · ".
  const lines = md.split("\n");
  const untabled = lines
    .filter((l, i) => !/^\s*\|[\s:|-]+\|\s*$/.test(l) && !(/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")))
    .map((l) => (/^\s*\|.*\|\s*$/.test(l) ? l.trim().slice(1, -1).split("|").map((c) => c.trim()).filter(Boolean).join(" · ") : l))
    .join("\n");
  return untabled
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, `$1: ${SITE}$2`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1: $2")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

/**
 * Marks her message read and shows "typing…" until our next message or 25 s, whichever comes first (send again for
 * longer).
 */
export const typing = (messageId: string) => post({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });

/** Text in pieces under WhatsApp's 4096 characters, split at paragraphs. */
export async function sendText(to: string, text: string) {
  const parts: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const last = parts.at(-1);
    if (last !== undefined && last.length + para.length + 2 <= 4000) parts[parts.length - 1] = `${last}\n\n${para}`;
    else parts.push(para.slice(0, 4000));
  }
  let ok = true;
  for (const body of parts) if (body.trim()) ok = (await post({ to, type: "text", text: { body, preview_url: false } })) && ok;
  return ok;
}

export type Choice = { title: string; description?: string };

/** Up to 3 short options as reply buttons (titles ≤ 20), else a list (≤ 10 rows, titles ≤ 24, descriptions ≤ 72). */
export async function sendChoices(to: string, question: string, options: Choice[]) {
  const body = { text: question.slice(0, 1024) };
  if (options.length <= 3 && options.every((o) => o.title.length <= 20 && !o.description))
    return post({ to, type: "interactive", interactive: { type: "button", body, action: { buttons: options.map((o, i) => ({ type: "reply", reply: { id: `c${i}`, title: o.title } })) } } });
  const rows = options.slice(0, 10).map((o, i) => ({ id: `c${i}`, title: o.title.slice(0, 24), ...(o.description && { description: o.description.slice(0, 72) }) }));
  return post({ to, type: "interactive", interactive: { type: "list", body, action: { button: "Choose", sections: [{ title: "Options", rows }] } } });
}
