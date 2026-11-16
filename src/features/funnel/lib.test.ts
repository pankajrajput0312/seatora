import { describe, expect, it } from "vitest";
import { funnel, isBot } from "./lib";
import { clientEventSchema } from "./validations";

const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("isBot", () => {
  it("crawlers, link previews, scripts and headless browsers are bots; people's browsers are not", () => {
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      chrome.replace("Chrome/", "HeadlessChrome/"),
      "",
      null,
    ];
    for (const ua of bots) expect(isBot(ua), String(ua)).toBe(true);
    for (const ua of [chrome, iphone]) expect(isBot(ua)).toBe(false);
  });
});

describe("clientEventSchema", () => {
  it("takes whitelisted names and placements only, and drops any ids in the body", () => {
    expect(clientEventSchema.safeParse({ name: "signup_done" }).success).toBe(false); // server-only event
    expect(clientEventSchema.safeParse({ name: "drop_table" }).success).toBe(false);
    expect(clientEventSchema.safeParse({ name: "upgrade_click", placement: "footer" }).success).toBe(false);
    expect(clientEventSchema.parse({ name: "upgrade_click", placement: "popup", userId: "u_evil", aid: "evil", meta: { email: "a@b.c" } })).toEqual({ name: "upgrade_click", placement: "popup" });
  });
});

describe("funnel", () => {
  it("counts unique people per stage (the account, else the device), with step and overall conversion", () => {
    const rows = [
      { name: "landing_view", userId: null, aid: "a1" },
      { name: "pricing_view", userId: null, aid: "a1" }, // one person, two pages
      { name: "landing_view", userId: null, aid: "a2" },
      { name: "landing_view", userId: null, aid: "a3" },
      { name: "landing_view", userId: "u4", aid: "a4" },
      { name: "landing_view", userId: null, aid: null }, // nobody known: not counted
      { name: "signup_view", userId: null, aid: "a1" },
      { name: "signup_view", userId: null, aid: "a2" },
      { name: "signup_done", userId: "u1", aid: "a1" },
      { name: "plan_popup_shown", userId: "u1", aid: "a1" },
      { name: "plan_popup_shown", userId: "u1", aid: "a9" }, // the same account on another device
      { name: "upgrade_click", userId: "u1", aid: "a1" },
      { name: "free_claimed", userId: "u1", aid: "a1" },
      { name: "checkout_opened", userId: "u1", aid: "a1" }, // claimed and opened checkout: still one person
    ];
    const f = funnel(rows);
    expect(f.map((s) => s.people)).toEqual([4, 2, 1, 1, 1, 1, 0]);
    expect(f.map((s) => s.step)).toEqual([null, 50, 50, 100, 100, 100, 0]);
    expect(f.map((s) => s.overall)).toEqual([null, 50, 25, 25, 25, 25, 0]);
    expect(funnel([]).map((s) => s.step)).toEqual([null, null, null, null, null, null, null]);
  });
});
