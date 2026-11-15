import { PrismaClient, type Prisma } from "@prisma/client";
import { expect, hasInvite, test } from "./auth";

// The Residents tab across colleges (/decide/residents) on the real imports (MCC + the private residents bundle), signed in
// to the invited account (e2e/auth.ts). Compares counts, ranks and columns with the database, never names (assertions read
// rank, year and count cells only, so a failure prints no name). Never confirms a Hide: that writes to the database under
// test. A failed test's page snapshot holds the page's names: run it with --output pointed at a private (0700) directory,
// or delete test-results/ afterwards. Each page load spends one of the account's daily name reads (residentsBudget).
test.skip(!process.env.DATABASE_URL || !hasInvite, "needs the imports in Postgres (DATABASE_URL) and the invited account (E2E_EMAIL)");

const PROFILE = "rank=42284&cat=OBC&c=MD~ANAESTHESIOLOGY,DNB~ANAESTHESIOLOGY,NBEMS Diploma~ANAESTHESIOLOGY,Diploma~ANAESTHESIOLOGY,DNB~FAMILYMEDICINE";
const HERS = ["md-anaesthesiology", "dnb-anaesthesiology", "nbems-diploma-anaesthesiology", "diploma-anaesthesiology", "dnb-family-medicine"];
const AROUND = { gte: 33827, lte: 50741 }; // 42,284 ± 20%
const n = (x: number) => x.toLocaleString("en-IN");

test("residents: her courses around her rank, filters, pages and views match the database; signed out it sends to sign-in", async ({ page, browser, isMobile }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  try {
    const count = (where: Prisma.ResidentWhereInput) => db.resident.count({ where: { hidden: false, ...where } });
    const hers = { specialty: { slug: { in: HERS } } };
    const [def, all, allRanked] = await Promise.all([count({ ...hers, rank: AROUND }), count(hers), count({ ...hers, rank: { not: null } })]);
    test.skip(!def, "needs the residents import (npm run db:import-residents)");
    const results = page.locator("#results");
    const table = page.getByRole("table");
    const cards = page.getByRole("list", { name: "Residents" }).getByRole("listitem");
    const pager = page.getByRole("navigation", { name: "Residents, pages" });

    // Default: her 5 courses, ranks ±20%, rank order; the table from md up, cards on phones.
    await page.goto(`/decide/residents?${PROFILE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Residents");
    await expect(results).toHaveText(`${n(def)} residents · rank known for ${n(def)}`);
    await expect(page.locator("p", { hasText: "around your rank" })).toContainText("Ranks 33,827–50,741, around your rank (±20%)");
    await expect(page.locator('select[name="course"] option:checked')).toHaveText("Your courses (5)");
    const years = (await db.resident.groupBy({ by: ["year"], where: { hidden: false }, orderBy: { year: "desc" } })).map((g) => String(g.year));
    await expect(page.locator('select[name="year"] option')).toHaveText(["All years", ...years]);
    const shown = isMobile ? cards : table.locator("tbody tr");
    await expect(shown).toHaveCount(Math.min(50, def));
    const first = await db.resident.findFirstOrThrow({ where: { hidden: false, ...hers, rank: AROUND }, orderBy: [{ rank: "asc" }, { name: "asc" }, { id: "asc" }], select: { rank: true } });
    await expect(isMobile ? shown.first().locator("dd").first() : shown.first().locator("td").first()).toContainText(n(first.rank!)); // the rank cell only
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // The nav says which view this width shows (no `view` in the URL).
    await expect(page.locator('nav[aria-label="Show residents as"]:visible a[aria-current="true"]')).toHaveText(isMobile ? "Cards" : "Table");

    // The (i) closes on Escape (focus back on it) and on a click outside it.
    const info = page.locator("details", { has: page.getByText("About this data") });
    await info.locator("summary").click();
    await expect(info).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(info).not.toHaveAttribute("open");
    await expect(info.locator("summary")).toBeFocused();
    await info.locator("summary").click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(info).not.toHaveAttribute("open");
    // Quotas naming a religion are one "Minority", in the filter too.
    await expect(page.locator('select[name="rq"] option', { hasText: /Muslim Minority|Jain Minority/ })).toHaveCount(0);

    // Apply with her default range untouched keeps it a default (fields empty, nothing fixed in the URL).
    await expect(page.getByLabel("Rank from")).toHaveValue("");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/rankFrom=(&|$)/);
    await expect(page.locator("p", { hasText: "around your rank" })).toContainText("Ranks 33,827–50,741, around your rank (±20%)");
    await expect(results).toHaveText(`${n(def)} residents · rank known for ${n(def)}`);

    await page.getByRole("link", { name: "All ranks" }).click();
    await expect(page).toHaveURL(/ranks=all/);
    await expect(results).toHaveText(`${n(all)} residents · rank known for ${n(allRanked)}`);

    // Filters: a typed rank range (commas allowed), then every course.
    await page.getByLabel("Rank from").fill("40,000");
    await page.getByLabel("Rank to").fill("45,000");
    await page.getByRole("button", { name: "Apply" }).click();
    const range = { gte: 40000, lte: 45000 };
    const inRange = await count({ ...hers, rank: range });
    await expect(results).toHaveText(`${n(inRange)} residents · rank known for ${n(inRange)}`);
    await page.locator('select[name="course"]').selectOption("all");
    await page.getByRole("button", { name: "Apply" }).click();
    const everyCourse = await count({ rank: range });
    await expect(results).toHaveText(`${n(everyCourse)} residents · rank known for ${n(everyCourse)}`);
    await expect(pager).toContainText(`Page 1 of ${n(Math.min(Math.ceil(everyCourse / 50), 20))}`); // 20: the deepest page served
    await pager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager).toContainText("Page 2 of");
    await expect(results).toBeFocused();

    // The table (forced on phones too): its columns, never a category; year sort starts on the newest list.
    await page.goto(`/decide/residents?${PROFILE}&ranks=all&sort=year&view=table`);
    await expect(table.getByRole("columnheader")).toHaveText(["Name", "Rank", "College", "Course", "Year", "List", "Quota", "Round", "Hide"]);
    await expect(table.locator("tbody tr").first().locator("td").nth(3)).toHaveText(years[0]);
    await expect(table.locator("tbody tr").first().getByRole("link").first()).toHaveAttribute("href", /^\/decide\/institutes\/[^?]+\?.*tab=residents/);

    // A page past the end (a stale link) or past the deepest one served (20): sent to the last page there is.
    const last = Math.min(Math.ceil(all / 50), 20);
    await page.goto(`/decide/residents?${PROFILE}&ranks=all&page=999`);
    await expect(page).toHaveURL(new RegExp(`[?&]page=${last}(&|$)`));
    await expect(pager).toContainText(`Page ${n(last)} of ${n(last)}`);
    await expect(page.getByText(/^Only the first 1,000 \(20 pages\) are shown/)).toHaveCount(all > 1000 ? 1 : 0);

    // Cards (forced on desktop too): Hide asks to confirm; Cancel goes back.
    await page.goto(`/decide/residents?${PROFILE}&view=cards`);
    await expect(cards).toHaveCount(Math.min(50, def));
    await cards.first().getByRole("button", { name: /^Hide / }).click();
    await expect(cards.first().getByRole("button", { name: /^Confirm: hide / })).toBeVisible();
    await cards.first().getByRole("button", { name: "Cancel" }).click();
    await expect(cards.first().getByRole("button", { name: /^Hide / })).toBeFocused();

    // No JSON API across colleges (scraping by paging); signed out, the page sends to sign-in.
    expect((await page.request.get("/api/v1/residents")).status()).toBe(404);
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } }); // tests' newContext reuses the signed-in state
    const out = await anon.newPage();
    await out.goto("/decide/residents");
    await expect(out).toHaveURL(/\/login\?next=%2Fdecide%2Fresidents$/);
    await anon.close();
  } finally {
    await db.$disconnect();
  }
});
