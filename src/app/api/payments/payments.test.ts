import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The three payment routes with the session, Razorpay's API (fetch) and the Payment table mocked (an in-memory table
// with updateMany's conditional semantics): auth, server-side amount, signatures, ownership, idempotent grant.

type Row = { id: string; userId: string; plan: string; amount: number; currency: string; razorpayOrderId: string; razorpayPaymentId: string | null; status: string; paidAt: Date | null };
const m = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string }, rows: [] as Row[], grant: vi.fn() }));

vi.mock("@/features/auth/lib/session", () => ({ getCurrentUser: async () => m.user }));
vi.mock("@/features/payments/grant", () => ({ grantPlan: m.grant }));
vi.mock("@/lib/db", () => {
  const match = (r: Row, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "not" in v ? r[k as keyof Row] !== v.not : r[k as keyof Row] === v));
  return {
    db: {
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
    },
  };
});

const order = await import("./order/route");
const verify = await import("./verify/route");
const webhook = await import("./webhook/route");

const SECRET = "key_secret_for_tests";
const WEBHOOK = "webhook_secret_for_tests";
const hmac = (s: string, k: string) => createHmac("sha256", k).update(s).digest("hex");
const alice = { id: "u_alice", email: "alice@seatora.test", name: "Alice" };
const bob = { id: "u_bob", email: "bob@seatora.test", name: "Bob" };
const row = (o: Partial<Row> = {}): Row => ({ id: "p1", userId: alice.id, plan: "season_pass", amount: 49900, currency: "INR", razorpayOrderId: "order_1", razorpayPaymentId: null, status: "created", paidAt: null, ...o });
const post = (handler: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request("http://test/api/payments", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));
const verifyBody = (orderId = "order_1", paymentId = "pay_1", secret = SECRET) => ({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: hmac(`${orderId}|${paymentId}`, secret) });

beforeEach(() => {
  m.user = alice;
  m.rows = [];
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
    expect((await order.POST()).status).toBe(401);
  });

  it("orders the plan's amount, never one from the client", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "order_new" }));
    vi.stubGlobal("fetch", fetch);
    // The handler never reads the body: a client's { amount: 100 } changes nothing.
    const res = await post(order.POST as (r: Request) => Promise<Response>, { amount: 100, currency: "USD", plan: "x" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order_new", amount: 49900, currency: "INR", keyId: "rzp_test_id", email: alice.email });
    const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ amount: 49900, currency: "INR", receipt: m.rows[0].id });
    expect(m.rows[0]).toMatchObject({ userId: alice.id, plan: "season_pass", amount: 49900, razorpayOrderId: "order_new", status: "created" });
  });

  it("answers 502 when Razorpay rejects the keys, 500 on other errors, 409 once paid", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { description: "Authentication failed" } }, { status: 401 }));
    const r1 = await order.POST();
    expect(r1.status).toBe(502);
    expect((await r1.json()).error.message).toBe("Payments are not set up");
    vi.stubGlobal("fetch", async () => Response.json({ error: { description: "boom" } }, { status: 500 }));
    expect((await order.POST()).status).toBe(500);
    expect(m.rows).toHaveLength(0);
    m.rows.push(row({ status: "paid" }));
    expect((await order.POST()).status).toBe(409);
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
    expect(m.grant).toHaveBeenCalledWith(alice.id, "season_pass");
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
