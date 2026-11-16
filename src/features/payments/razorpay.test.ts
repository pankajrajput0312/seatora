import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidPaymentSignature, isValidWebhookSignature } from "./razorpay";

const secret = "test_secret_value";
const sign = (data: string, key = secret) => createHmac("sha256", key).update(data).digest("hex");

describe("isValidPaymentSignature", () => {
  const good = sign("order_A|pay_B");
  it("accepts Razorpay's signature", () => expect(isValidPaymentSignature("order_A", "pay_B", good, secret)).toBe(true));
  it("rejects a bad signature", () => {
    expect(isValidPaymentSignature("order_A", "pay_B", sign("order_A|pay_B", "other"), secret)).toBe(false);
    expect(isValidPaymentSignature("order_A", "pay_B", "", secret)).toBe(false);
    expect(isValidPaymentSignature("order_A", "pay_B", "not-hex", secret)).toBe(false);
  });
  it("rejects a tampered order or payment id", () => {
    expect(isValidPaymentSignature("order_X", "pay_B", good, secret)).toBe(false);
    expect(isValidPaymentSignature("order_A", "pay_X", good, secret)).toBe(false);
    expect(isValidPaymentSignature("order_A", "pay_B", good.slice(0, -1) + (good.endsWith("0") ? "1" : "0"), secret)).toBe(false);
  });
});

describe("isValidWebhookSignature", () => {
  const body = '{"event":"payment.captured"}';
  it("accepts the body's HMAC", () => expect(isValidWebhookSignature(body, sign(body), secret)).toBe(true));
  it("rejects a changed body or wrong secret", () => {
    expect(isValidWebhookSignature(body + " ", sign(body), secret)).toBe(false);
    expect(isValidWebhookSignature(body, sign(body, "other"), secret)).toBe(false);
  });
});
