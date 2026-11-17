import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner's WhatsApp line for sign-ups and upgrades, with the sender and the database mocked.
const m = vi.hoisted(() => ({ sent: [] as string[], textOk: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/whatsapp/cloud-api", () => ({
  sendText: async (_to: string, text: string) => (m.sent.push(`text:${text}`), m.textOk),
  sendTemplate: async (_to: string, name: string, params: string[]) => (m.sent.push(`template:${name}:${params[0]}`), true),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ u1: { name: "Asha", email: "asha@x.in", phone: null }, u2: { name: "Ravi", email: "wa-919800000000@whatsapp.seatora.co.in", phone: "919800000000" } })[where.id] ?? null },
    couponRedemption: { findFirst: async () => ({ coupon: { code: "DRTARAL" } }) },
  },
}));
const { alertOwner, ownerLine } = await import("./owner-alert");

beforeEach(() => {
  m.sent = [];
  m.textOk = true;
  vi.stubEnv("OWNER_WHATSAPP", "919800000001");
});

describe("owner alerts", () => {
  it("says who and what, the number for a WhatsApp account", async () => {
    expect(ownerLine("signup_done", "Asha (asha@x.in)", { referred: true })).toBe("New sign-up on Seatora: Asha (asha@x.in), invited by a friend.");
    expect(ownerLine("free_claimed", "Asha (asha@x.in)", {})).toBe("Upgrade on Seatora: Asha (asha@x.in) took the free Season Pass.");
    expect(ownerLine("payment_paid", "Asha (asha@x.in)", { amount: 19900 })).toBe("Payment on Seatora: Asha (asha@x.in) paid ₹199 for the Season Pass.");
    await alertOwner("signup_done", "u2", { via: "whatsapp" });
    await alertOwner("payment_paid", "u1", { amount: 0, coupon: true });
    expect(m.sent).toEqual(["text:New sign-up on Seatora: Ravi (+919800000000), on WhatsApp.", "text:Upgrade on Seatora: Asha (asha@x.in) got the Season Pass free with coupon DRTARAL."]);
  });

  it("falls back to the template outside the 24-hour window; nothing without OWNER_WHATSAPP or for other events", async () => {
    m.textOk = false;
    await alertOwner("free_claimed", "u1");
    expect(m.sent.at(-1)).toBe("template:seatora_update:Upgrade on Seatora: Asha (asha@x.in) took the free Season Pass.");
    m.sent = [];
    await alertOwner("pricing_view", "u1");
    vi.stubEnv("OWNER_WHATSAPP", "");
    await alertOwner("signup_done", "u1");
    expect(m.sent).toEqual([]);
  });
});
