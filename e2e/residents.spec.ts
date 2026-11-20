import { PrismaClient, type Prisma } from "@prisma/client";
import { expect, hasInvite, test } from "./auth";

// The Residents tab across colleges (/decide/residents) on the real imports (MCC + the private residents bundle), signed in
// to the invited account (e2e/auth.ts). Compares counts, years and columns with the database, never names (assertions
// read count, year and header cells only, so a failure prints no name). No rank is shown, filtered or sorted by. A failed
// test's page snapshot holds the page's names: run it with --output pointed at a private (0700) directory, or delete
// test-results/ afterwards. Each page load spends one of the account's daily name reads (residentsBudget).
test.skip(!process.env.DATABASE_URL || !hasInvite, "needs the imports in Postgres (DATABASE_URL) and the invited account (E2E_EMAIL)");

const PROFILE = "rank=42284&cat=OBC&c=MD~ANAESTHESIOLOGY,DNB~ANAESTHESIOLOGY,NBEMS Diploma~ANAESTHESIOLOGY,Diploma~ANAESTHESIOLOGY,DNB~FAMILYMEDICINE";
const HERS = ["md-anaesthesiology", "dnb-anaesthesiology", "nbems-diploma-anaesthesiology", "diploma-anaesthesiology", "dnb-family-medicine"];
const n = (x: number) => x.toLocaleString("en-IN");

test("residents: her courses, newest year first, no rank; filters by college and course, pages and views match the database; signed out it sends to sign-in", async ({ page, browser, isMobile }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient();
  try {
    const count = (where: Prisma.ResidentWhereInput) => db.resident.count({ where: { hidden: false, ...where } });
    const hers = { specialty: { slug: { in: HERS } } };
    const [def, everyone] = await Promise.all([count(hers), count({})]);
    test.skip(!def, "needs the residents import (npm run db:import-residents)");
    const main = page.locator("#astryx-app-shell-main");
    const results = main.locator("#results");
    const table = page.getByRole("table");
    const cards = page.getByRole("region", { name: "Residents", exact: true }).getByRole("listitem");
    const pager = page.getByRole("navigation", { name: "Residents, pages" });
    const filtersButton = page.getByRole("button", { name: /^Filters/ });

    // Default: her 5 courses, every rank (none shown), newest year first; the table on a desktop, cards on a phone.
    await page.goto(`/decide/residents?${PROFILE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Residents");
    await expect(results).toHaveText(`${n(def)} residents`);
    await expect(page.getByRole("group", { name: "Active filters" })).toContainText("Your courses (5)");
    await expect(filtersButton).toContainText(/1 applied/);
    const years = (await db.resident.groupBy({ by: ["year"], where: { hidden: false }, orderBy: { year: "desc" } })).map((g) => String(g.year));
    await expect(page.locator('select[name="year"] option')).toHaveText(["All years", ...years]);
    const shown = isMobile ? cards : table.locator("tbody tr");
    await expect(shown).toHaveCount(Math.min(50, def));
    await expect(page.locator("[data-view-pane]").getByText(/AIR \d/)).toHaveCount(0); // (the sidebar shows her own rank)
    await expect(results).not.toContainText("rank");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // Cards | Table says which view this device shows (no `layout` in the URL); only that one is in the page.
    await expect(page.getByRole("group", { name: "View as" }).locator('a[aria-current="true"]')).toHaveText(isMobile ? "Cards" : "Table");
    await expect(page.locator("[data-view-pane]")).toHaveCount(1);

    // The (i) beside the title closes on Escape (focus back on it) and on a click outside it.
    const info = page.getByRole("button", { name: "About Residents" });
    const tip = page.getByRole("dialog", { name: "Residents" });
    await info.click();
    await expect(tip).toBeVisible();
    await expect(tip).not.toContainText(/All India Rank|NBEMS/);
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await expect(info).toBeFocused();
    await info.click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(tip).toBeHidden();
    // The admitted lists are in the page's one Sources footer.
    await expect(page.locator("#page-sources summary")).toContainText(/Sources \(\d+\)/);
    // Quotas naming a religion are one "Minority", in the filter too; no rank sort.
    await expect(page.locator('select[name="rq"] option', { hasText: /Muslim Minority|Jain Minority/ })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Sort" }).locator("option")).toHaveText(["Year, newest first", "Name A–Z", "Course A–Z", "College A–Z"]);

    // A college by name (type it in the search box, tick it, Search): only its residents in her courses.
    const college = await db.college.findFirstOrThrow({ where: { residents: { some: { hidden: false, ...hers } } }, orderBy: { name: "asc" }, select: { slug: true, name: true } });
    await page.getByRole("combobox", { name: "Search a name or hospital" }).fill(college.name.split(" ").slice(0, 2).join(" ").toLowerCase());
    await page.getByRole("group", { name: "Matches" }).getByRole("checkbox", { name: college.name }).first().check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`college=${college.slug}`));
    await expect(results).toHaveText(`${n(await count({ ...hers, college: { slug: college.slug } }))} residents`);

    // Every course (the branch filter), every college: everyone, 20 pages at most.
    await page.goto(`/decide/residents?${PROFILE}&course=all`);
    await expect(results).toHaveText(`${n(everyone)} residents`);
    await expect(pager).toContainText(`Page 1 of ${n(Math.min(Math.ceil(everyone / 50), 20))}`); // 20: the deepest page served
    await pager.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager).toContainText("Page 2 of");
    await expect(results).toBeFocused();

    // The table (forced on phones too): its columns, never a rank or a category; the newest list first.
    await page.goto(`/decide/residents?${PROFILE}&layout=table`);
    await expect(table.getByRole("columnheader")).toHaveText(["Name", "College", "Course", "Year", "List", "Quota", "Round"]);
    await expect(table.locator("tbody tr").first().locator("td").nth(2)).toHaveText(years[0]);
    await expect(table.locator("tbody tr").first().getByRole("link").first()).toHaveAttribute("href", /^\/decide\/institutes\/[^?]+\?.*tab=residents/);

    // A page past the end (a stale link) or past the deepest one served (20): sent to the last page there is.
    const last = Math.min(Math.ceil(def / 50), 20);
    await page.goto(`/decide/residents?${PROFILE}&page=999`);
    await expect(page).toHaveURL(new RegExp(`[?&]page=${last}(&|$)`));
    await expect(pager).toContainText(`Page ${n(last)} of ${n(last)}`);

    // Cards (forced on desktop too): one per resident, the year big, no rank.
    await page.goto(`/decide/residents?${PROFILE}&layout=cards`);
    await expect(cards).toHaveCount(Math.min(50, def));
    await expect(cards.first()).toContainText(years[0]);
    await expect(page.locator('[data-view-pane="table"]')).toHaveCount(0);

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
