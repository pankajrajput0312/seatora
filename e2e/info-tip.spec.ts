import { expect, test } from "./auth";

// InfoTip (the (i) popovers) and the page's one "Sources (N)" footer, in a real browser: the Overview's charts put
// their explanation behind an InfoTip, and every DataSource line's numbers open the footer.
test.skip(!process.env.DATABASE_URL, "needs the MCC data in Postgres (DATABASE_URL)");

const OVERVIEW = "/decide?rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE";

test("an InfoTip opens with Enter, Space and a tap, closes with Escape, outside click and Tab out, focus in and back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(OVERVIEW);
  const btn = page.getByRole("button", { name: "About Where your rank sits" });
  const tip = page.getByRole("dialog", { name: "Where your rank sits" });
  await expect(tip).toBeHidden();

  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(tip).toBeVisible();
  await expect(tip).toBeFocused();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(btn).toBeFocused();
  await expect(btn).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Space");
  await expect(tip).toBeVisible();
  await page.mouse.click(5, 300); // outside
  await expect(tip).toBeHidden();

  await btn.click();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Tab"); // the panel has no links: out to the next control
  await expect(tip).toBeHidden();

  // A 44px hit area round the 20px icon.
  const b = (await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el, "::before"); return { w: r.width + 2 * -parseFloat(s.left), h: r.height + 2 * -parseFloat(s.top) }; }));
  expect(b.w).toBeGreaterThanOrEqual(44);
  expect(b.h).toBeGreaterThanOrEqual(44);
});

test("one collapsed Sources footer per page; a numbered ref opens it at its entry", async ({ page }) => {
  await page.goto(OVERVIEW);
  const footer = page.locator("details#page-sources");
  await expect(footer).toHaveCount(1);
  await expect(footer).not.toHaveAttribute("open", "");
  await expect(footer.locator("summary")).toHaveText(/^Sources \(\d+\)$/);
  const ref = page.getByRole("link", { name: /^Source 1: / }).first();
  await ref.click();
  await expect(footer).toHaveAttribute("open", "");
  await expect(page.locator("#source-1")).toBeFocused();
  // Numbers are 1…N with no gaps.
  const ns = await footer.locator("li[id^=source-]").evaluateAll((els) => els.map((e) => Number(e.id.slice(7))));
  expect(ns).toEqual(ns.map((_, i) => i + 1));
});

test("a stat cell's (i) opens by keyboard; its source number opens the page's Sources footer at that entry", async ({ page }) => {
  // Kokilaben's DNB fee is the NBEMS maximum: the Fee (i) says so and cites the NBEMS document by its page number.
  await page.goto("/decide/fees?rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE&q=Kokilaben&layout=cards");
  const footer = page.locator("details#page-sources");
  await expect(footer).toBeAttached(); // client-rendered: the refs are numbered from here on
  const btn = page.getByRole("button", { name: "About fee, Kokilaben Dhirubhai Ambani Hospital, DNB", exact: true }).filter({ visible: true }).first();
  await btn.focus();
  await page.keyboard.press("Enter");
  const tip = page.getByRole("dialog", { name: "fee, Kokilaben Dhirubhai Ambani Hospital, DNB", exact: true }).filter({ visible: true });
  await expect(tip).toBeFocused();
  await expect(tip).toContainText("NBEMS");
  const ref = tip.getByRole("link", { name: /^Source \d+: / }).first();
  const n = (await ref.getAttribute("href"))!.replace("#source-", "");
  await page.keyboard.press("Tab"); // into the panel: its first link
  await expect(ref).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tip).toBeHidden();
  await expect(footer).toHaveAttribute("open", "");
  await expect(page.locator(`#source-${n}`)).toBeFocused();
});
