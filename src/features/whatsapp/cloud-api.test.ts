import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { incoming, toWhatsApp, validSignature } = await import("./cloud-api");

const hook = (message: object) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "919800000000", profile: { name: "Asha" } }], messages: [{ id: "wamid.1", from: "919800000000", ...message }] } }] }] });

describe("whatsapp", () => {
  it("reads text, a button tap and a list pick as her text", () => {
    expect(incoming(hook({ type: "text", text: { body: " hi " } }))).toEqual([{ id: "wamid.1", phone: "919800000000", name: "Asha", text: "hi" }]);
    expect(incoming(hook({ type: "interactive", interactive: { button_reply: { id: "c0", title: "OBC" } } }))[0].text).toBe("OBC");
    expect(incoming(hook({ type: "interactive", interactive: { list_reply: { id: "c2", title: "MD Radiology" } } }))[0].text).toBe("MD Radiology");
    expect(incoming(hook({ type: "image" }))[0].text).toBeNull();
    expect(incoming({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toEqual([]);
  });

  it("turns markdown into WhatsApp text", () => {
    expect(toWhatsApp("## Top\n**KMC** - see [options](/decide/options)\n- one")).toBe("*Top*\n*KMC* - see options: https://www.seatora.co.in/decide/options\n• one");
  });

  it("turns a table into one line per row", () => {
    expect(toWhatsApp("Top\n\n| No. | College | Closing |\n|---|---|---|\n| 1 | [AIIMS](/decide/institutes/aiims) | 1,234 |\n| 2 | KEM | 2,345 |")).toBe("Top\n\n1 · AIIMS: https://www.seatora.co.in/decide/institutes/aiims · 1,234\n2 · KEM · 2,345");
  });

  it("checks Meta's signature", () => {
    process.env.WHATSAPP_APP_SECRET = "s3cret";
    const sig = `sha256=${createHmac("sha256", "s3cret").update("{}").digest("hex")}`;
    expect(validSignature("{}", sig)).toBe(true);
    expect(validSignature("{ }", sig)).toBe(false);
    expect(validSignature("{}", null)).toBe(false);
  });
});
