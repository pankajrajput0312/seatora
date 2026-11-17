import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { limitLine, PlanCardsView } from "./plan-cards";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");
const card = (html: string, plan: "FREE" | "PREMIUM") => html.split(`data-plan="${plan}"`)[1].split("data-plan=")[0];

describe("PlanCardsView", () => {
  const render = (current: "FREE" | "PREMIUM" | null, free: Date | null, more: { got?: string; invite?: { name: string; amount: number } } = {}) =>
    renderToStaticMarkup(h(PlanCardsView, { current, free, ...more, cta: h("button", null, "CTA"), freeCta: h("a", { href: "/signup" }, "Create free account") }));

  it("a Free user: the badge and a disabled Current plan on Free; the free period's ribbon and ₹0 on the Season Pass", () => {
    const html = render("FREE", new Date("2026-11-20T18:29:59Z"));
    expect(text(card(html, "FREE"))).toContain("Your plan");
    expect(card(html, "FREE")).toMatch(/<button type="button" disabled=""[^>]*>Current plan<\/button>/);
    expect(text(card(html, "PREMIUM"))).not.toContain("Your plan");
    const pass = text(card(html, "PREMIUM"));
    expect(pass).toContain("Free till 20 Nov");
    // One price now and one after, never a struck "was" price beside ₹0.
    expect(pass).toContain("₹0now");
    expect(pass).not.toContain("₹499");
    expect(pass).toContain("Free till 20 Nov. Then ₹199 once — no auto-renew, no card now.");
    expect(pass).not.toContain("Valid till"); // the free upgrade ends with the free period
    expect(pass).toContain("CTA");
  });

  it("lines come from the plans config; after the free period ~~₹499~~ ₹199 and no ribbon; signed out gets the Free card's CTA", () => {
    const html = render(null, null);
    expect(text(card(html, "FREE"))).toContain("10 institute pages a day10 residents searches a day2 options in Compare1 saved choice listNo CSV exportsNo plan reports");
    expect(text(card(html, "PREMIUM"))).toContain("Unlimited institute pages200 residents searches a day4 options in Compare10 saved choice listsUnlimited CSV exportsUnlimited plan reports");
    expect(text(html)).not.toMatch(/Your plan|Free till|Current plan/);
    expect(text(card(html, "PREMIUM"))).toContain("Was ₹499, now ₹199₹499₹199once, no auto-renew");
    expect(text(card(html, "PREMIUM"))).toContain("₹159 with an invite, valid till 31 Mar 2027.");
    expect(card(html, "FREE")).toContain('<a href="/signup">Create free account</a>');
    expect(limitLine("ask", 0)).toBe("No Ask Seatora questions a day");
  });

  it("her pass: what she got in place of the price; a friend's invite: its price, in and after the free period", () => {
    const pass = text(card(render("PREMIUM", null, { got: "₹0 · code DRTARAL · till 31 Mar 2027" }), "PREMIUM"));
    expect(pass).toContain("₹0 · code DRTARAL · till 31 Mar 2027");
    expect(pass).not.toMatch(/₹499|₹199/);
    // The free claim: when it ends and what happens then, never the paid pass's end date.
    const claimed = text(card(render("PREMIUM", new Date("2026-11-20T18:29:59Z"), { got: "Active · free till 20 Nov" }), "PREMIUM"));
    expect(claimed).toContain("Your free pass ends 20 Nov. After that you return to the Free plan (your list stays) unless you pay ₹199 once. We never charge automatically.");
    expect(claimed).not.toContain("31 Mar 2027");
    const sneha = { name: "Sneha", amount: 15900 };
    expect(text(card(render("FREE", new Date("2026-11-20T18:29:59Z"), { invite: sneha }), "PREMIUM"))).toContain("Sneha's invite: ₹159 after 20 Nov (instead of ₹199)");
    expect(text(card(render("FREE", null, { invite: sneha }), "PREMIUM"))).toContain("Was ₹499, now ₹159₹499₹159with Sneha's invite");
  });
});
