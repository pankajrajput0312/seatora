import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ submitFeatureRequest: vi.fn(), setRequestStatus: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { RequestForm } = await import("./request-form");
const { RequestStatusSelect } = await import("./request-status-select");
const { firstLine, requestDate, RequestStatusChip } = await import("./request-bits");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
/** The first <input> tag carrying `attr`, lowercased (attribute order and case don't matter). */
const input = (h: string, attr: string) => (h.match(/<input[^>]*>/g) ?? []).find((t) => t.includes(attr))?.toLowerCase() ?? "";

describe("RequestForm", () => {
  it("public: every kind as a radio, an editable email, the page, a honeypot and the count", () => {
    const h = html(createElement(RequestForm, { page: "/contact" }));
    expect(h.match(/type="radio"/g)).toHaveLength(4);
    for (const label of ["New feature", "Customization for me", "Data correction or missing data", "Something else"]) expect(h).toContain(label);
    expect(input(h, 'id="rq-email"')).not.toContain("readonly");
    expect(h).toContain('href="/privacy"');
    expect(input(h, 'type="hidden"')).toContain('value="/contact"');
    expect(input(h, 'name="website"')).toContain('tabindex="-1"');
    expect(h).toContain("0 / 2,000 characters");
    expect(h).toContain('aria-live="polite"');
    expect(input(h, 'id="rq-email"')).toContain('aria-required="true"');
    expect(h).toMatch(/<textarea[^>]*aria-required="true"/);
    expect(h).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/); // until hydrated: a send would lose the message
  });

  it("signed in: the account email, read-only, and no privacy link", () => {
    const h = html(createElement(RequestForm, { email: "doc@seatora.test", page: "/decide/requests" }));
    expect(input(h, 'id="rq-email"')).toMatch(/readonly="".*value="doc@seatora.test"|value="doc@seatora.test".*readonly=""/);
    expect(h).toContain("Your account email.");
    expect(h).not.toContain('href="/privacy"');
  });
});

describe("request bits", () => {
  it("firstLine skips leading blank lines", () => expect(firstLine("\n  Add a bond filter\nfor Delhi")).toBe("Add a bond filter"));
  it("requestDate is India's day", () => expect(requestDate("2026-11-14T20:00:00.000Z")).toBe("15 Nov 2026"));
  it("status chip and select", () => {
    expect(html(createElement(RequestStatusChip, { status: "planned" }))).toContain("Planned");
    const s = html(createElement(RequestStatusSelect, { id: "r1", status: "done", label: "New feature" }));
    expect(s.match(/<option/g)).toHaveLength(4);
    expect(s).toMatch(/<option value="done" selected="">Done<\/option>/);
  });
});
