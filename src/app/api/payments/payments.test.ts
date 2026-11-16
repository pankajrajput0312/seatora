import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reset } from "@/lib/rate-limit";

// The three payment routes with the session, Razorpay's API (fetch) and the Payment, User and ReferralEarning tables
// mocked (in memory, with updateMany's conditional semantics): auth, server-side amount, the referral discount,
// signatures, ownership, idempotent grant and earning.

type Row = {
  id: string; userId: string; plan: string; amount: number; listAmount: number; discount: number; referrerId: string | null; currency: string;
  razorpayOrderId: string; razorpayPaymentId: string | null; status: string; paidAt: Date | null;
};
type User = { id: string; email: string; name: string; referralCode: string | null; referredById: string | null };
type Earning = { referrerId: string; paymentId: string; buyerId: string; amount: number; status: string; note?: string | null; inTx: boolean };
const m = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; name: string },
  rows: [] as Row[],
  users: [] as User[],
  earnings: [] as Earning[],
  inTx: false,
  grant: vi.fn(),
}));

vi.mock("@/features/auth/lib/session", () => ({ getCurrentUser: async () => m.user }));
vi.mock("@/features/payments/grant", () => ({ grantPlan: m.grant }));
vi.mock("@/lib/db", () => {
  const match = (r: object, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "not" in v ? r[k as keyof typeof r] !== v.not : r[k as keyof typeof r] === v));
  const db = {
    $transaction: async (fn: (tx: unknown) => unknown) => {
      m.inTx = true;
      try {
        return await fn(db);
      } finally {
        m.inTx = false;
      }
    },
    user: { findUnique: async ({ where }: { where: Record<string, unknown> }) => m.users.find((u) => match(u, where)) ?? null },
    payment: {
      create: async ({ data }: { data: Omit<Row, "razorpayPaymentId" | "status" | "paidAt"> }) => m.rows.push({ razorpayPaymentId: null, status: "created", paidAt: null, ...data }),
      findUnique: async ({ where }: { where: Record<string, unknown> }) => m.rows.find((r) => match(r, where)) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => m.rows.find((r) => match(r, where)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = m.rows.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    referralEarning: {
      // The unique paymentId: skipDuplicates is ON CONFLICT DO NOTHING.
      createMany: async ({ data, skipDuplicates }: { data: Omit<Earning, "status" | "inTx">[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const d of data) {
          if (m.earnings.some((e) => e.paymentId === d.paymentId)) {
            if (!skipDuplicates) throw new Error("Unique constraint failed on paymentId");
          } else {
            m.earnings.push({ status: "pending", ...d, inTx: m.inTx });
            count++;
          }
        }
        return { count };
      },
      updateMany: async ({ where, data }: { where: { status: string; payment: { razorpayPaymentId: string } }; data: Partial<Earning> }) => {
        const ids = m.rows.filter((r) => r.razorpayPaymentId === where.payment.razorpayPaymentId).map((r) => r.id);
        const hit = m.earnings.filter((e) => e.status === where.status && ids.includes(e.paymentId));
        hit.forEach((e) => Object.assign(e, data));
        return { count: hit.length };
      },
    },
  };
  return { db };
});

const order = await import("./order/route");
const verify = await import("./verify/route");
const webhook = await import("./webhook/route");

const SECRET = "key_secret_for_tests";
const WEBHOOK = "webhook_secret_for_tests";
const hmac = (s: string, k: string) => createHmac("sha256", k).update(s).digest("hex");
const alice = { id: "u_alice", email: "alice@seatora.test", name: "Alice" };
const bob = { id: "u_bob", email: "bob@seatora.test", name: "Bob" };
const rahul: User = { id: "u_rahul", email: "rahul@seatora.test", name: "Rahul Sharma", referralCode: "RHUX234", referredById: null };
const row = (o: Partial<Row> = {}): Row => ({
  id: "p1", userId: alice.id, plan: "season_pass", amount: 19900, listAmount: 19900, discount: 0, referrerId: null, currency: "INR",
  razorpayOrderId: "order_1", razorpayPaymentId: null, status: "created", paidAt: null, ...o,
});
const ordered = () => vi.fn(async () => Response.json({ id: "order_new" }));
const sentAmount = (fetch: ReturnType<typeof ordered>) => JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).amount;
const post = (handler: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request("http://test/api/payments", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));
const verifyBody = (orderId = "order_1", paymentId = "pay_1", secret = SECRET) => ({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: hmac(`${orderId}|${paymentId}`, secret) });

beforeEach(() => {
  reset(`pay-order:${alice.id}`); // 10 orders a minute
  m.user = alice;
  m.rows = [];
  m.earnings = [];
  m.users = [{ ...alice, referralCode: "ALCE234", referredById: null }, { ...bob, referralCode: null, referredById: null }, { ...rahul }];
  m.grant.mockReset();
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_id");
  vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/payments/order", () => {
  it("needs a signed-in user", async () => {
    m.user = null;
    expect((await post(order.POST, {})).status).toBe(401);
  });

  it("orders the plan's amount, never one from the client", async () => {
    const fetch = ordered();
    vi.stubGlobal("fetch", fetch);
    // Only referralCode is read: a client's { amount: 100 } changes nothing.
    const res = await post(order.POST, { amount: 100, currency: "USD", plan: "x", discount: 19900 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order_new", amount: 19900, listAmount: 19900, discount: 0, inviter: null, currency: "INR", keyId: "rzp_test_id", email: alice.email });
    const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ amount: 19900, currency: "INR", receipt: m.rows[0].id });
    expect(m.rows[0]).toMatchObject({ userId: alice.id, plan: "season_pass", amount: 19900, listAmount: 19900, discount: 0, referrerId: null, razorpayOrderId: "order_new", status: "created" });
    // An empty body is fine; a malformed code field is a 400.
    expect((await order.POST(new Request("http://test/api/payments/order", { method: "POST" }))).status).toBe(200);
    expect((await post(order.POST, { referralCode: 42 })).status).toBe(400);
  });

  it("answers 502 when Razorpay rejects the keys, 500 on other errors, 409 once paid", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { description: "Authentication failed" } }, { status: 401 }));
    const r1 = await post(order.POST, {});
    expect(r1.status).toBe(502);
    expect((await r1.json()).error.message).toBe("Payments are not set up");
    vi.stubGlobal("fetch", async () => Response.json({ error: { description: "boom" } }, { status: 500 }));
    expect((await post(order.POST, {})).status).toBe(500);
    expect(m.rows).toHaveLength(0);
    m.rows.push(row({ status: "paid" }));
    expect((await post(order.POST, {})).status).toBe(409);
  });
});

describe("referral pricing (order route)", () => {
  it("a friend's code: 20% off, ₹199 → ₹159, the referrer on the row; the client's amount is still ignored", async () => {
    const fetch = ordered();
    vi.stubGlobal("fetch", fetch);
    const res = await post(order.POST, { referralCode: " rhux234 ", amount: 1 });
    expect(await res.json()).toMatchObject({ amount: 15900, listAmount: 19900, discount: 4000, inviter: "Rahul" });
    expect(sentAmount(fetch)).toBe(15900);
    expect(m.rows[0]).toMatchObject({ amount: 15900, listAmount: 19900, discount: 4000, referrerId: rahul.id });
  });

  it("her own referredById comes first, whatever code she types", async () => {
    m.users[0].referredById = rahul.id;
    vi.stubGlobal("fetch", ordered());
    expect(await (await post(order.POST, {})).json()).toMatchObject({ amount: 15900, inviter: "Rahul" });
    expect(await (await post(order.POST, { referralCode: "ALCE234" })).json()).toMatchObject({ amount: 15900, inviter: "Rahul" });
    expect(m.rows.map((r) => r.referrerId)).toEqual([rahul.id, rahul.id]);
  });

  it("refuses her own code and an unknown one (400, no order)", async () => {
    const fetch = ordered();
    vi.stubGlobal("fetch", fetch);
    const own = await post(order.POST, { referralCode: "ALCE234" });
    expect([own.status, (await own.json()).error.code]).toEqual([400, "invalid_referral"]);
    expect((await post(order.POST, { referralCode: "ZZZZ999" })).status).toBe(400);
    expect((await post(order.POST, { referralCode: "bad!" })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(m.rows).toHaveLength(0);
  });

  it("no discount once she has paid before", async () => {
    m.users[0].referredById = rahul.id;
    m.rows.push(row({ id: "old", plan: "earlier_plan", status: "paid", razorpayOrderId: "order_old" }));
    vi.stubGlobal("fetch", ordered());
    expect(await (await post(order.POST, {})).json()).toMatchObject({ amount: 19900, discount: 0, inviter: null });
    expect(m.rows[1]).toMatchObject({ amount: 19900, discount: 0, referrerId: null });
    expect((await post(order.POST, { referralCode: "RHUX234" })).status).toBe(400);
  });
});

describe("POST /api/payments/verify", () => {
  it("needs a user and all three fields", async () => {
    expect((await post(verify.POST, { razorpay_order_id: "order_1" })).status).toBe(400);
    m.user = null;
    expect((await post(verify.POST, verifyBody())).status).toBe(401);
  });

  it("rejects a bad or tampered signature without changing anything", async () => {
    m.rows.push(row());
    expect((await post(verify.POST, verifyBody("order_1", "pay_1", "wrong"))).status).toBe(400);
    expect((await post(verify.POST, { ...verifyBody(), razorpay_payment_id: "pay_2" })).status).toBe(400);
    expect(m.rows[0].status).toBe("created");
    expect(m.grant).not.toHaveBeenCalled();
  });

  it("refuses someone else's order", async () => {
    m.rows.push(row());
    m.user = bob;
    expect((await post(verify.POST, verifyBody())).status).toBe(404);
    expect(m.rows[0].status).toBe("created");
  });

  it("marks the payment paid and grants once, however often it is repeated", async () => {
    m.rows.push(row());
    for (let i = 0; i < 3; i++) expect((await post(verify.POST, verifyBody())).status).toBe(200);
    expect(m.rows[0]).toMatchObject({ status: "paid", razorpayPaymentId: "pay_1" });
    expect(m.rows[0].paidAt).toBeInstanceOf(Date);
    expect(m.grant).toHaveBeenCalledTimes(1);
    expect(m.grant).toHaveBeenCalledWith(alice.id, "season_pass", expect.anything());
  });
});

describe("referral earning (markPaid)", () => {
  it("20% of what was paid (₹159 → ₹31.80), pending, once, inside the paid-mark transaction", async () => {
    m.rows.push(row({ amount: 15900, discount: 4000, referrerId: rahul.id }));
    for (let i = 0; i < 3; i++) await post(verify.POST, verifyBody());
    const captured = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } });
    await post(webhook.POST, captured, { "x-razorpay-signature": hmac(captured, WEBHOOK) });
    expect(m.earnings).toEqual([{ referrerId: rahul.id, paymentId: "p1", buyerId: alice.id, amount: 3180, status: "pending", inTx: true }]);
    expect(m.grant).toHaveBeenCalledTimes(1);
  });

  it("none without a referrer", async () => {
    m.rows.push(row());
    await post(verify.POST, verifyBody());
    expect(m.rows[0].status).toBe("paid");
    expect(m.earnings).toHaveLength(0);
  });

  it("a refund (webhook) voids a pending earning", async () => {
    m.rows.push(row({ amount: 15900, discount: 4000, referrerId: rahul.id }));
    await post(verify.POST, verifyBody());
    const refund = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1" } } } });
    expect((await post(webhook.POST, refund, { "x-razorpay-signature": hmac(refund, WEBHOOK) })).status).toBe(200);
    expect(m.earnings[0]).toMatchObject({ status: "void", note: expect.stringContaining("rfnd_1") });
  });
});

describe("POST /api/payments/webhook", () => {
  const captured = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } });
  const signed = (body: string, key = WEBHOOK) => ({ "x-razorpay-signature": hmac(body, key) });

  it("is off (503) without a webhook secret", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect((await post(webhook.POST, captured, signed(captured))).status).toBe(503);
  });

  it("rejects a bad signature", async () => {
    m.rows.push(row());
    expect((await post(webhook.POST, captured, signed(captured, "wrong"))).status).toBe(400);
    expect((await post(webhook.POST, captured)).status).toBe(400);
    expect(m.rows[0].status).toBe("created");
  });

  it("payment.captured then verify (or a redelivery) grants once", async () => {
    m.rows.push(row());
    expect((await post(webhook.POST, captured, signed(captured))).status).toBe(200);
    expect((await post(webhook.POST, captured, signed(captured))).status).toBe(200);
    expect((await post(verify.POST, verifyBody())).status).toBe(200);
    expect(m.rows[0].status).toBe("paid");
    expect(m.grant).toHaveBeenCalledTimes(1);
  });

  it("order.paid marks paid; payment.failed marks failed but never undoes paid", async () => {
    m.rows.push(row(), row({ id: "p2", razorpayOrderId: "order_2" }));
    const failed = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_x", order_id: "order_2" } } } });
    await post(webhook.POST, failed, signed(failed));
    expect(m.rows[1].status).toBe("failed");
    const paid = JSON.stringify({ event: "order.paid", payload: { order: { entity: { id: "order_2" } }, payment: { entity: { id: "pay_2", order_id: "order_2" } } } });
    await post(webhook.POST, paid, signed(paid));
    expect(m.rows[1].status).toBe("paid");
    await post(webhook.POST, failed, signed(failed));
    expect(m.rows[1].status).toBe("paid");
    expect(m.rows[0].status).toBe("created");
  });
});
