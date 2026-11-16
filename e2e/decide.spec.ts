import { PrismaClient } from "@prisma/client";
import { expect, test } from "./auth";

// Runs on the real MCC import (spot values: neetpg-planner docs/HANDOFF_CONTEXT.md §7), signed in to the invited account
// (e2e/auth.ts). Without a database Decide only shows "Data unavailable", so the whole file is skipped.
test.skip(!process.env.DATABASE_URL, "needs the MCC data in Postgres (DATABASE_URL)");

const PROFILE = "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE";

test("plan routes render real data, never demo data", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [path, h1] of [
    ["/decide", "Home"], ["/decide/options", "Options"], ["/decide/choices", "Choices"], ["/decide/compare", "Compare"],
    // Rank scan, last ranks, seats, counselling, institutes, allotments and fees: see "research and counselling routes" below.
  ]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(h1);
    await expect(page.getByText(/demo data|illustrative/i), path).toHaveCount(0);
  }
});

test("every route: skip link is the first tab stop, no sideways scroll at 390 px", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/decide", "/decide/options", "/decide/choices", "/decide/compare", "/decide/institutes", "/decide/institutes/government-medical-college-nagpur-440003?tab=courses",
    "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/fees", "/decide/seats", "/decide/seats?tab=trends", "/decide/counselling",
    "/decide/institutes/ssb-heart-and-multispeciality-hospital-121001?tab=clinical"]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" }), path).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
  // The Seats matrix's and Allotments' Display menus open on screen, every checkbox visible (the menu shows with the
  // table; at 390 px the pages open on cards).
  for (const path of ["/decide/seats", "/decide/allotments"]) {
    await page.goto(`${path}?${PROFILE}&layout=table`);
    await page.locator("summary", { hasText: "Display" }).click();
    for (const box of await page.getByRole("group", { name: "Columns shown" }).getByRole("checkbox").all()) {
      const b = (await box.boundingBox())!;
      expect(b.x, path).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, path).toBeLessThanOrEqual(390);
    }
  }
});

test("set profile, label options, and reorder choices with the keyboard only", async ({ page }) => {
  await page.goto("/decide/options");
  await page.getByRole("link", { name: "Set your rank" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("All India Rank").fill("42284");
  await dialog.getByLabel("Category").selectOption("OBC");
  // No saved profile: the first-run setup, one step at a time (rank, courses, quotas), then Options.
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByLabel("Anaesthesiology").check();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/decide\/options\?.*rank=42284/);
  await expect(page.getByText("Reached in 2026 R1").filter({ visible: true }).first()).toBeVisible();

  const stars = page.locator('button[aria-pressed="false"][aria-label^="In Round "]').filter({ visible: true });
  for (let i = 0; i < 3; i++) await stars.first().click(); // a clicked star becomes pressed, so .first() moves to the next row

  await page.goto(`/decide/choices?${PROFILE}&layout=cards`); // the list (desktop opens on the table)
  // The first list is named after the round MCC's schedule has her fill next.
  const list = page.getByRole("list", { name: /Round \d · 2026 choice list, 3 items/ });
  const names = async () => list.locator(":scope > li").evaluateAll((lis) => lis.map((li) => li.querySelector("a")?.textContent));
  await expect(list).toBeVisible();
  const before = await names();
  expect(before.every(Boolean)).toBe(true);

  const handle = list.getByRole("button", { name: /^Reorder .*position 1 of 3/ });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(names).toEqual([before[1], before[0], before[2]]);

  await page.getByRole("button", { name: new RegExp(`^Move ${esc(before[2]!)}.* up$`) }).click();
  await expect.poll(names).toEqual([before[1], before[2], before[0]]);
});

test("overview leads with what's open now and the round's numbers, each opening that Options view", async ({ page }) => {
  await page.goto(`/decide?${PROFILE}`);
  await expect(page.getByRole("region", { name: "MCC counselling 2026 now" })).toBeVisible();
  const numbers = page.getByRole("region", { name: "Round 2 seats in your courses" });
  await expect(numbers).toContainText("Options with Round 2 seats");
  await expect(numbers).toContainText(/1,065\s*708 clear, 357 virtual only/); // the long sentence is behind its (i)
  await numbers.getByRole("link", { name: "708 clear, 357 virtual only" }).click(); // the stat's own link opens the Round 2 view
  await expect(page.locator("#options-count")).toContainText("of 1,065 options");
});

// ---- Options, choices and compare on the real MCC data (her profile: AIR 42,284, OBC, Anaesthesiology + Family Medicine) ----
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPT_KOKILA_ANAES = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710~DNB~ANAESTHESIOLOGY~DNB Quota";
const OPT_KOKILA_FM = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710~DNB~FAMILYMEDICINE~DNB Quota";
const OPT_GMC_NAGPUR = "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT#440003~MD~ANAESTHESIOLOGY~All India";

test("options, the round view by default: her options with 2026 R2 seats, new ones included, closed ones shown; toggles widen and switch", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/options?${PROFILE}`);
  // Her courses in MCC's 2026 R2 lists (seats.ndjson): 1,065 options, 708 clear vacancy, 357 virtual only, 103 with newly added seats.
  const summary = page.getByRole("region", { name: "2026 R2 seats in your courses" });
  // Short; the full sentence (103 with newly added seats…) is behind its (i) "About 2026 R2 seats".
  await expect(summary).toContainText(/^1,065 with 2026 R2 seats:\s*708 clear,\s*357 virtual only,\s*\d+ new: no past allotment/);
  await expect(summary).toContainText("103 with newly added seats");
  await expect(page.getByRole("link", { name: "All 1,065 options" })).toBeVisible();
  const count = page.locator("#options-count");
  await expect(count).toContainText("Showing 1–25 of 1,065 options");
  await expect(page.getByText(/Closed ones shown\./).first()).toBeVisible(); // "…every round of …" is behind the (i)

  // New options: their own chip; a real row whose star saves it under its option id.
  const fresh = Number((await summary.getByRole("link", { name: /new\s*: no past allotment/ }).textContent())!.match(/[\d,]+/)![0].replace(",", ""));
  await page.getByRole("link", { name: new RegExp(`^New: no past allotment ${fresh} options$`) }).click();
  await expect(count).toContainText(`of ${fresh} options`);
  const row = page.locator("[data-item]").filter({ visible: true }).first();
  await expect(row).toContainText("New: no past allotment");
  await row.getByRole("button", { name: /^In Round 2/ }).click();
  await page.goto(`/decide/choices?${PROFILE}&layout=cards`); // the list (desktop opens on the table)
  await expect(page.getByRole("list", { name: /choice list, 1 item/ })).toContainText("New: no past allotment");

  // Also options without R2 seats; then the view of every option with past allotments, closed hidden.
  await page.goto(`/decide/options?${PROFILE}`);
  await page.getByRole("link", { name: "Also without R2 seats" }).click();
  await expect(count).toContainText(`of ${formatN(1282 + fresh)} options`);
  await page.getByRole("link", { name: /^Every option with past allotments/ }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(count).toContainText("of 641 options");

  // From the New chip, the other view drops that label (it has no new options) instead of opening empty.
  await page.goto(`/decide/options?${PROFILE}&reach=new`);
  await page.getByRole("link", { name: /^Every option with past allotments/ }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(page).not.toHaveURL(/reach=/);
  await expect(count).toContainText("of 641 options");
  // The summary's new link opens every new option, whatever the seats filter.
  await page.goto(`/decide/options?${PROFILE}&seats=virtual`);
  await page.getByRole("region", { name: "2026 R2 seats in your courses" }).getByRole("link", { name: /new\s*: no past allotment/ }).click();
  await expect(count).toContainText(`of ${fresh} options`);
  // Hide them by keyboard: the same link, now "Show them", keeps focus.
  await page.goto(`/decide/options?${PROFILE}`);
  await page.getByRole("link", { name: "Hide them" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/closed=0/);
  await expect(page.getByRole("link", { name: "Show them" })).toBeFocused();
});
const formatN = (n: number) => n.toLocaleString("en-IN");

test("Cards | Table writes `layout`, keeps the page's own `view`, renders only the view on show, and the choice survives a visit without `layout`", async ({ page }) => {
  // Options' view=all and Seats' view=list are their own list views: the toggle must never overwrite them.
  for (const [path, view, page_] of [[`/decide/options?${PROFILE}&view=all`, "all", "options"], [`/decide/seats?${PROFILE}&view=list`, "list", "seats"]]) {
    await page.goto(path);
    const toggle = page.getByRole("group", { name: "View as" });
    for (const v of ["Cards", "Table"]) {
      await toggle.getByRole("link", { name: v, exact: true }).click(); // a navigation: the page comes back in that view
      await expect.poll(() => new URL(page.url()).searchParams.get("layout"), path).toBe(v.toLowerCase());
      await expect(toggle.getByRole("link", { name: v, exact: true }), path).toHaveAttribute("aria-current", "true");
      expect(new URL(page.url()).searchParams.get("view"), path).toBe(view);
      await expect(page.locator(`[data-view-pane="${v.toLowerCase()}"]`).first(), path).toBeVisible();
      await expect(page.locator(`[data-view-pane="${v === "Cards" ? "table" : "cards"}"]`), path).toHaveCount(0); // never both in the page
    }
    // The cookie the toggle set: the same page without `layout` opens on the table.
    expect((await page.context().cookies()).find((c) => c.name === `medpath.view.${page_}`)?.value, path).toBe("table");
    await page.goto(path);
    await expect(page.locator('[data-view-pane="table"]').first(), path).toBeVisible();
    await expect(page.locator('[data-view-pane="cards"]'), path).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "One list" })).toHaveAttribute("aria-current", "true");
  await page.goto(`/decide/options?${PROFILE}&view=all&layout=cards`);
  await expect(page.locator("#options-count")).toContainText("of 641 options");
});

/** Opens the page's Filters sheet (list pages keep their filters behind it). */
const openFilters = async (page: import("@playwright/test").Page) => {
  if (!(await page.getByRole("dialog", { name: "Filters" }).isVisible())) await page.getByRole("button", { name: /^Filters/ }).click();
};
/** The sheet's submit: "Show N results" (or "Show results" once a field changed). */
const showResults = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: /^Show/ }).click();

test("filters sit behind a Filters button: its count, a sheet with sections, Escape closes it with focus back on it, Show results keeps them; a chip opens its filter", async ({ page }) => {
  await page.goto(`/decide/fees?${PROFILE}&maxleave=5`);
  const button = page.getByRole("button", { name: /^Filters/ });
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(page.getByRole("searchbox")).toBeVisible(); // the search box stays out
  await expect(sheet).toBeHidden();
  await expect(button).toContainText(/Filters\s*\d+ applied/);
  await button.click();
  await expect(sheet).toBeVisible();
  // Sections say what they are set to; the money filters are one "Fees & bond" section.
  await expect(sheet.locator("summary", { hasText: "Fees & bond" })).toContainText("Leaving penalty up to ₹5 L");
  await expect(sheet.getByRole("button", { name: /^Show [\d,]+ results?$/ })).toBeVisible();
  await sheet.getByRole("combobox").first().focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await showResults(page); // a plain GET form: the page loads again, the sheet closed
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/maxleave=5/);
  // The chip's words open its filter in the sheet, its section open; only its × removes it.
  await page.getByRole("group", { name: "Active filters" }).getByRole("button", { name: /^Change filter: Leaving penalty/ }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Leaving penalty" })).toBeFocused();
});

test("options, the view of every option with past allotments: her 641 options in the open quotas (25 at a time), Show more focuses the first new row, two ticked states both apply", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/options?${PROFILE}&view=all`);
  await expect(page.getByRole("link", { name: "All 641 options" })).toBeVisible();
  const count = page.locator("#options-count");
  await expect(count).toContainText("Showing 1–25 of 641 options");
  await expect(page.locator("[data-item]").filter({ visible: true })).toHaveCount(25); // one page, never the whole list
  await page.getByRole("button", { name: "Show 25 more" }).click();
  await expect(count).toContainText("Showing 1–50 of 641 options");
  await expect(page.locator('[data-item="26"]').filter({ visible: true })).toBeFocused();

  // Multi-select: both ticked states apply (repeated st params), and stay ticked.
  await openFilters(page);
  await page.locator("summary", { hasText: "State" }).click();
  await page.getByRole("checkbox", { name: "Maharashtra" }).check();
  await page.getByRole("checkbox", { name: "Karnataka" }).check();
  await expect(page.locator("summary", { hasText: "State" })).toContainText("2 selected"); // live, before it applies
  await showResults(page);
  await expect(page).toHaveURL(/st=Maharashtra/);
  await expect(page).toHaveURL(/st=Karnataka/);
  await expect(count).toContainText("of 138 options");
  await expect(page.locator("summary", { hasText: "State" })).toContainText("2 selected");
});

test("options and compare: official closings with their seat category, 2026 R1 final", async ({ page }) => {
  // Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota: 2026 R1 20,132 (Open seat, final); 2025 deepest 33,685 (stray).
  await page.goto(`/decide/options?${PROFILE}&q=Kokilaben&closed=1`);
  const row = page.locator("[data-item]").filter({ visible: true }).filter({ hasText: "DNB Anaesthesiology" })
    .filter({ has: page.getByRole("link", { name: "Kokilaben Dhirubhai Ambani Hospital", exact: true }) });
  // The table says "R1, Open seat"; a card's header has "2026 · R1" and "Open seat" as chips.
  for (const v of ["20,132", "R1", "Open seat", "33,685", "Stray, Open seat"]) await expect(row).toContainText(v);
  await expect(row).not.toContainText("Provisional");

  // GMC Nagpur 2026 R1 MD Anaesthesiology: OBC closing 17,213 and 12 allotments (all categories).
  await page.goto(`/decide/compare?${new URLSearchParams({ ids: [OPT_KOKILA_ANAES, OPT_GMC_NAGPUR].join(",") })}&${PROFILE}`);
  const table = page.getByRole("table", { name: "Comparison of 2 options" });
  for (const v of ["20,132", "17,213", "R1, OBC seat", "2026 R1 closing", "Leaving"]) await expect(table).toContainText(v);
  await expect(table).not.toContainText(/provisional/i);
  await expect(table.getByRole("row", { name: /^Allotments made/ })).toContainText("12");

  // Removing a column focuses the next one; removing the last focuses the page heading (never <body>).
  await page.getByRole("button", { name: /^Remove Kokilaben .* from compare$/ }).click();
  await expect(page.locator(`[id="col-${OPT_GMC_NAGPUR}"]`)).toBeFocused();
  await page.getByRole("button", { name: /^Remove Government Medical College, Nagpur.* from compare$/ }).click();
  await expect(page.getByRole("heading", { name: "Nothing to compare yet" })).toBeVisible();
  await expect(page.locator("#main-h1")).toBeFocused();
});

test("compare without a rank asks for one instead of claiming no past allotment", async ({ page }) => {
  await page.goto(`/decide/compare?${new URLSearchParams({ ids: OPT_KOKILA_ANAES })}`);
  await expect(page.getByRole("link", { name: "Set your rank to see" })).toBeVisible();
  await expect(page.getByText("No past allotment in your categories")).toHaveCount(0);
  await page.getByRole("button", { name: "About previous years' closing ranks" }).click(); // the note is behind its (i)
  await expect(page.getByText(/deepest on any seat category/)).toBeVisible();
});

test("choices: labels follow the current data, Undo goes back to its own list, a swap of typed items is flagged", async ({ page }) => {
  const item = (id: string, institute: string, slug: string, course: string, courseSlug: string, quota: string) =>
    ({ id, institute, slug, state: "Maharashtra", course, courseSlug, quota, reachLabel: "Reached in 2026 R1", closedEveryRound: false }); // stale on purpose
  const items = [
    item(OPT_KOKILA_ANAES, "Kokilaben Dhirubhai Ambani Hospital", KOKILA_NM, "DNB Anaesthesiology", "dnb-anaesthesiology", "DNB Quota"),
    item(OPT_KOKILA_FM, "Kokilaben Dhirubhai Ambani Hospital", KOKILA_NM, "DNB Family Medicine", "dnb-family-medicine", "DNB Quota"),
    item(OPT_GMC_NAGPUR, "Government Medical College, Nagpur", GMC_NAGPUR, "MD Anaesthesiology", "md-anaesthesiology", "All India"),
  ];
  await page.goto(`/decide/choices?${PROFILE}`);
  await page.evaluate((items) => localStorage.setItem("medpath.choices", JSON.stringify({
    lists: [{ id: "r2", name: "Round 2 · 2026", items, typedIds: [] }, { id: "r3", name: "Round 3 · 2026", items: [], typedIds: [] }],
    activeId: "r2",
  })), items);
  await page.goto(`/decide/choices?${PROFILE}&layout=cards`); // the list (desktop opens on the table)
  const list = page.getByRole("list", { name: /Round 2 · 2026 choice list, 3 items/ });
  // All three closed before AIR 42,284 on Open/OBC seats: the stored "Reached in 2026 R1" is replaced.
  await expect(list.getByText("Closed before your rank", { exact: true })).toHaveCount(3);
  await expect(list.getByText(/\(when added\)/)).toHaveCount(0);

  await page.getByRole("button", { name: "Remove Government Medical College, Nagpur, MD Anaesthesiology" }).click();
  await page.getByRole("button", { name: /^Round 3 · 2026/ }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(list).toBeVisible();
  await expect(page.getByRole("button", { name: /^Round 3 · 2026/ })).toContainText("(0)");

  const typedUpTo = page.getByLabel(/Mark how far you've typed into MCC/);
  await typedUpTo.fill("2");
  await expect(list.getByText("Typed into MCC")).toHaveCount(2);
  await page.getByRole("button", { name: "Move Kokilaben Dhirubhai Ambani Hospital, DNB Family Medicine up" }).click();
  await expect(list.getByText(/Marked typed, but its position changed/)).toHaveCount(2);
  await expect(typedUpTo).toHaveValue("0");
});

// ---- Research and counselling screens on the real MCC data (spot values: neetpg-planner docs/HANDOFF_CONTEXT.md §7) ----
const SETH_GS = "seth-gordhandas-sunderdas-medical-college-400012";
const KOKILA_NM = "kokilaben-dhirubhai-ambani-hospital-400710";
const GMC_NAGPUR = "government-medical-college-nagpur-440003";
const h1 = (page: import("@playwright/test").Page) => page.getByRole("heading", { level: 1 });
/** A college's slug by key: an import sets it when it first creates the college and never changes it (import-mcc.ts), so it depends on the database's history. */
async function slugOf(key: string) {
  const db = new PrismaClient();
  try {
    return (await db.college.findUniqueOrThrow({ where: { key }, select: { slug: true } })).slug;
  } finally {
    await db.$disconnect();
  }
}

test("saved ids under a retired college key move to the key the college has now, once, with a notice", async ({ page }) => {
  // AMRI Hospitals Mukundapur: its key before the round-2 bundle (key_aliases.json) and the one it has now.
  const id = (k: string) => `${k}~DNB~ANAESTHESIOLOGY~DNB Quota`;
  const [oldId, newId] = [id("AMRIHOSPITALSMUKUNDAPUR223BARAKHOLALANEB#700099"), id("AMRIHOSPITALSWESTBENGALAMRIHOSPITALSMUKU#700099")];
  await page.goto(`/decide/choices?${PROFILE}`);
  await page.evaluate((oldId) => {
    const item = { id: oldId, institute: "AMRI Hospitals (old name)", slug: "amri-hospitals-mukundapur-700099", state: "West Bengal", course: "DNB Anaesthesiology", courseSlug: "dnb-anaesthesiology", quota: "DNB Quota", reachLabel: "", closedEveryRound: false };
    localStorage.setItem("medpath.choices", JSON.stringify({ lists: [{ id: "r2", name: "Round 2 · 2026", items: [item], typedIds: [oldId] }], activeId: "r2" }));
    localStorage.setItem("medpath.compare", JSON.stringify([oldId]));
  }, oldId);
  await page.reload();
  // (The first /api/v1/retired-keys of a fresh server reads the database cold: allow it time.)
  await expect(page.getByRole("status").filter({ hasText: "1 saved option was renamed after MCC's college names were cleaned up." })).toBeVisible({ timeout: 15_000 });
  const stored = await page.evaluate(() => [JSON.parse(localStorage.getItem("medpath.choices")!), JSON.parse(localStorage.getItem("medpath.compare")!)]);
  expect([stored[0].lists[0].items[0].id, stored[0].lists[0].typedIds, stored[1]]).toEqual([newId, [newId], [newId]]);
  expect(stored[0].lists[0].items[0].slug).toBe(await slugOf("AMRIHOSPITALSWESTBENGALAMRIHOSPITALSMUKU#700099"));
  // Once: nothing left to rename on the next load. An old compare link opens the option under its new key.
  await page.goto(`/decide/compare?${new URLSearchParams({ ids: oldId })}`);
  await expect.poll(() => new URL(page.url()).searchParams.get("ids")).toBe(newId);
  await expect(page.getByRole("columnheader", { name: /DNB Anaesthesiology, DNB Quota/ })).toHaveCount(1);
  await expect(page.getByText(/saved options? (was|were) renamed/)).toHaveCount(0);
});

test("research and counselling routes render real data, never demo data", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [path, title] of [
    ["/decide/rank-scan", "Rank scan"], ["/decide/last-ranks", "Last ranks"], ["/decide/seats?tab=trends", "Seats"],
    ["/decide/counselling", "Counselling"], ["/decide/institutes", "Institutes"], ["/decide/allotments", "Allotments"],
    ["/decide/fees", "Fees, stipend and bond"], [`/decide/institutes/${GMC_NAGPUR}?tab=allotments`, "Government Medical College, Nagpur"], [`/decide/institutes/${GMC_NAGPUR}`, "Government Medical College, Nagpur"],
  ]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await expect(h1(page), path).toHaveText(title);
    await expect(page.getByText(/demo data|illustrative/i), path).toHaveCount(0);
  }
});

test("last ranks show the official closings: closing on one seat category, allotments in every category", async ({ page }) => {
  // Kokilaben Navi Mumbai, DNB Anaesthesiology, DNB Quota, Open seats: 2025 R1 → stray, then 2026 R1 (final).
  // The institute link opens the page that holds its row.
  await page.goto(`/decide/last-ranks?${PROFILE}&course=dnb-anaesthesiology&lcat=Open&lquota=DNB+Quota&inst=${KOKILA_NM}&layout=table`); // phones open on cards
  const kokila = page.locator(`#inst-${KOKILA_NM}`);
  await expect(kokila).toBeVisible();
  for (const v of ["21,699", "25,059", "29,892", "33,685", "20,132"]) await expect(kokila).toContainText(v);
  await expect(page.getByRole("columnheader", { name: "2026", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Provisional/ })).toHaveCount(0);

  // Seth GS MD Anaesthesiology, All India, 2026 R1: OBC 11,842 and Open 8,502, both with 20 allotments (all categories).
  await page.goto(`/decide/last-ranks?${PROFILE}&course=md-anaesthesiology&lcat=OBC&lquota=All+India&inst=${SETH_GS}`);
  await expect(page.locator(`#inst-${SETH_GS}`)).toContainText("11,842 (20)");
  await openFilters(page);
  await page.getByLabel("Seat category").selectOption("Open");
  await showResults(page);
  await expect(page).toHaveURL(/lcat=Open/);
  await expect(page.locator(`#inst-${SETH_GS}`)).toContainText("8,502 (20)");
});

test("allotments: own filter keys, comma ranks, pages, and GMC Nagpur 2026 R1", async ({ page }) => {
  // GMC Nagpur 2026 R1 MD Anaesthesiology: 12 allotments; the deepest OBC seat went to 17,213.
  await page.goto(`/decide/allotments?${PROFILE}&inst=${GMC_NAGPUR}&course=md-anaesthesiology&year=2026&round=R1`);
  await expect(page.locator("#results")).toContainText("1–12 of 12");
  const table = page.getByRole("region", { name: "Allotments", exact: true });
  await expect(table.getByText("Provisional")).toHaveCount(0); // 2026 R1 is final
  // Comboboxes: the Display menu has checkboxes with the same names.
  await openFilters(page);
  await page.getByRole("combobox", { name: "Seat category" }).selectOption("OBC");
  await showResults(page);
  await expect(page).toHaveURL(/acat=OBC/);
  await expect(table).toContainText("17,213");

  // The quota filter is `aq`, never her profile's `quota`; "30,000" is a rank.
  await page.goto(`/decide/allotments?${PROFILE}&from=30,000&to=50,000`);
  await expect(page.getByLabel("Rank from")).toHaveValue("30,000");
  await expect(page.locator("#results")).not.toContainText("2,09,566");
  await openFilters(page);
  await page.getByRole("combobox", { name: "Quota" }).selectOption("All India");
  await showResults(page);
  await expect(page).toHaveURL(/aq=All\+India/);
  await expect(page).not.toHaveURL(/[?&]quota=/);
  await page.goto(`/decide/allotments?${PROFILE}&from=abc`);
  await expect(page.getByText("That range was not applied.")).toBeVisible(); // (Next's route announcer is also role=alert)
});

test("Allotments' R2 columns, Display and CSV: 2023 rank 23 upgraded in R2 to Seth GS on choice 1", async ({ page }) => {
  // Allotments: candidate category, choice no., status and previous seat; a column hidden under Display; the CSV.
  await page.goto(`/decide/allotments?${PROFILE}&year=2023&round=R2&from=23&to=23&layout=table`); // Allotments opens on cards
  const table = page.getByRole("region", { name: "Allotments", exact: true });
  // By column (`data-col`), so the stat cells or a new column between them never break it.
  const first = table.getByRole("row").nth(1);
  for (const [col, v] of [["quota", "All India"], ["seat", "Open"], ["cand", "General"], ["option", "1"], ["status", "Upgraded"]]) await expect(first.locator(`[data-col="${col}"]`), col).toHaveText(v);
  await page.getByText("Display").click();
  await page.getByRole("checkbox", { name: "Previous seat" }).uncheck();
  await expect(table.getByRole("columnheader", { name: /Previous seat/ })).toBeHidden();
  await page.getByRole("checkbox", { name: "Previous seat" }).check();
  const csv = await (await page.request.get(await page.getByRole("link", { name: /Download CSV/ }).getAttribute("href") ?? "")).text();
  expect(csv).toContain(",Candidate category,Choice no.,Status,");
  expect(csv).toContain(",All India,Open,General,1,Upgraded,Seth Gordhandas Sunderdas Medical College,");
  await expect(table.getByRole("link", { name: /^Journey/ })).toHaveCount(0); // Rank journey is gone (its page is a 404)
});

test("wide tables: the page is the one vertical scroller, the header row pins under the top bar and scrolls sideways with the body", async ({ page }) => {
  await page.goto(`/decide/options?${PROFILE}&layout=table`); // phones open on cards
  const table = page.locator("[data-scroll-table]").first();
  const body = table.getByRole("region");
  const pinned = table.locator(":scope > [data-stuck]");
  await expect(pinned).toHaveCount(0); // at rest the real header shows
  // Mid-table: the copy shows, right under the app's top bar.
  await table.evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY + 400));
  await expect(pinned).toBeVisible();
  const bar = await page.locator(".astryx-app-shell-header").evaluate((e) => e.getBoundingClientRect().bottom);
  expect(Math.abs((await pinned.boundingBox())!.y - bar)).toBeLessThanOrEqual(1);
  // The wheel over the table scrolls the page; the table box never scrolls up and down.
  const box = (await body.boundingBox())!;
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(box.x + box.width / 2, bar + 200);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y0);
  expect(await body.evaluate((e) => [e.scrollTop, getComputedStyle(e).overflowY])).toEqual([0, "hidden"]);
  // Sideways, the copy follows the body.
  const max = await body.evaluate((e) => e.scrollWidth - e.clientWidth);
  if (max > 0) {
    await body.evaluate((e) => (e.scrollLeft = 120));
    await expect.poll(() => pinned.evaluate((e) => e.firstElementChild!.scrollLeft)).toBe(await body.evaluate((e) => e.scrollLeft));
  }
});

test("print: every table box lets all its rows onto paper", async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of [
    // layout=table: phones open on cards (no table box).
    `/decide/options?${PROFILE}&layout=table`, `/decide/seats?${PROFILE}&layout=table`, `/decide/allotments?${PROFILE}&course=md-anaesthesiology&year=2025&round=R2&layout=table`,
    `/decide/last-ranks?${PROFILE}&course=dnb-anaesthesiology&layout=table`, `/decide/compare?${new URLSearchParams({ ids: [OPT_KOKILA_ANAES, OPT_GMC_NAGPUR].join(",") })}&${PROFILE}`,
  ]) {
    await page.goto(path);
    await page.emulateMedia({ media: "print" });
    const boxes = page.locator('[role=region][tabindex="0"]');
    await expect(boxes.first(), path).toBeAttached();
    for (const b of await boxes.all()) expect(await b.evaluate((e) => e.scrollHeight - e.clientHeight), path).toBeLessThanOrEqual(1);
    await page.emulateMedia({ media: null });
  }
  // A4 landscape less its 8mm margins (about 1062px): the tables' last columns stay on the page (Seats' matrix is wider).
  if (test.info().project.name === "desktop") {
    for (const path of [`/decide/options?${PROFILE}&layout=table`, `/decide/allotments?${PROFILE}&course=md-anaesthesiology&year=2025&round=R2&layout=table`, `/decide/last-ranks?${PROFILE}&course=dnb-anaesthesiology&layout=table`]) {
      await page.goto(path);
      await page.setViewportSize({ width: 1062, height: 1000 });
      await page.emulateMedia({ media: "print" });
      const right = await page.locator("table").first().evaluate((t) => Math.max(...[...t.querySelectorAll("thead th")].map((x) => x.getBoundingClientRect().right)));
      expect(right, path).toBeLessThanOrEqual(1062 + 1);
      await page.emulateMedia({ media: null });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  }
  // The college's name and address print above its tabs.
  await page.goto(`/decide/institutes/${KOKILA_NM}?${PROFILE}&tab=fees`);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/^Address as printed by MCC/)).toBeVisible();
});

test("institute page: MCC address, terms with their sources, paginated allotments", async ({ page, isMobile }) => {
  await page.goto(`/decide/institutes/${KOKILA_NM}?${PROFILE}&tab=fees`);
  await page.getByRole("button", { name: "About address" }).click(); // the address is behind its (i)
  await expect(page.getByRole("dialog", { name: "address" })).toContainText("Navi Mumbai");
  // DNB, the fee table's DNB Quota seats: the NBEMS maximum fee and minimum stipend each year (labelled, never the
  // college's figures), the whole course, and "No bond" from the NBEMS rule's record; one source numbering for the block.
  const dnb = page.getByRole("region", { name: "DNB", exact: true });
  const quota = dnb.getByRole("region", { name: "DNB Quota seats" });
  const y1 = quota.getByRole("row", { name: /^Year 1/ });
  for (const v of ["Up to ₹1,25,000", "From ₹43,000"]) await expect(y1).toContainText(v);
  await expect(quota.getByRole("row", { name: /^Whole course/ })).toContainText("₹3,75,000");
  // Each figure's number opens the page's one Sources footer at its document (one URL, one entry).
  const ceiling = quota.getByRole("link", { name: /^Source \d+: NBEMS annual course fee \(ceiling, no GST\)/ }).first();
  const n = (await ceiling.getAttribute("href"))!.replace("#source-", "");
  await ceiling.click();
  await expect(page.locator(`#source-${n}`)).toBeFocused();
  await expect(page.locator(`#source-${n}`).getByRole("link").first()).toHaveAttribute("href", /natboard\.edu\.in/);
  await expect(dnb).toContainText("No bond (NBEMS rule)");
  await expect(dnb).not.toContainText("GST to NBEMS");
  // The bond box's NBEMS bulletin is the same document as the fee ceiling's (the same PDF): the same number.
  await expect(dnb.getByRole("region", { name: "Service bond" }).getByRole("link", { name: new RegExp(`^Source ${n}: NBEMS Accreditation Information Bulletin`) })).toBeVisible();

  await page.goto(`/decide/institutes/${SETH_GS}?${PROFILE}&tab=allotments`);
  const results = page.locator("#results");
  const per = isMobile ? 25 : 50; // 25 a page on a phone (server/view.ts pageSizeFor)
  await expect(results).toContainText(`1–${per} of 1,001`);
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(results).toContainText(`${per + 1}–${per * 2} of 1,001`);
  await expect(results).toBeFocused();
});

test("fees: a fee in the profile's own words shows no figure anywhere; MCC's Round 2 forfeit from the fee table", async ({ page }) => {
  // Chettinad: the MCC profile gives ₹3 L–₹48 L by specialty, so the fee table is verbatim: words and link, no ₹ fee.
  // Its slug comes from the name it had when this database first imported it (renamed since): by key.
  const slug = await slugOf("CHETTINADSUPERSPECIALITYHOSPITALTAMILNAD#603103");
  await page.goto(`/decide/institutes/${slug}?${PROFILE}`);
  const fee1 = (h: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: h, exact: true }) }).getByRole("definition").first();
  await expect(fee1("MD/MS")).toHaveText("Varies by subject"); // the Overview's Fee cell: words only, no ₹
  await page.goto(`/decide/institutes/${slug}?${PROFILE}&tab=fees`);
  const group = page.getByRole("region", { name: "MD/MS", exact: true }).getByRole("region", { name: "Deemed/Paid seats" });
  await expect(group).toContainText("Seatora shows no fee figure here");
  await expect(group.getByRole("columnheader", { name: "Fee that year" })).toHaveCount(0);
  await expect(group.getByRole("link", { name: /MCC institute profile, read/ })).toHaveAttribute("href", /mcc\.admissions\.nic\.in/);
  // Goa MC: ₹70,324 at admission, later years not stated: no whole-course figure; the Round 2 forfeit ₹8,432.
  await page.goto(`/decide/institutes/goa-medical-college-403202?${PROFILE}`);
  await expect(fee1("MD/MS")).toHaveText(/^₹70,324\s*at admission$/);
  await page.goto(`/decide/institutes/goa-medical-college-403202?${PROFILE}&tab=fees`);
  const md = page.getByRole("region", { name: "MD/MS", exact: true });
  await expect(md.getByRole("row", { name: /^Whole course/ })).toHaveCount(0);
  await expect(md).toContainText("₹8,432 forfeited if you resign or don't join from Round 2");
  await expect(md.getByRole("definition").filter({ hasText: "What MCC lets the college keep" })).toContainText("₹8,432");
});

test("removing a filter chip moves focus to the chip now in its place, and with none left to the results heading", async ({ page }) => {
  await page.goto(`/decide/fees?${PROFILE}&maxfee=5&minstip=60000`);
  const chips = page.getByRole("group", { name: "Active filters" });
  await chips.getByRole("link", { name: /^Remove filter: Fee up to/ }).click();
  await expect(page).not.toHaveURL(/maxfee=/);
  await expect(page.getByRole("status").filter({ hasText: /^Removed Fee up to/ })).toContainText("Undo");
  const stipend = chips.getByRole("link", { name: /^Remove filter: Stipend at least/ });
  await expect(stipend).toBeFocused();
  await stipend.press("Enter");
  await expect(page).not.toHaveURL(/minstip=/);
  await expect(page.locator("#results")).toBeFocused();
});

test("hospital facts: self-reported values with their sources, the disclosed stipend, block flags said once", async ({ page }) => {
  await page.goto(`/decide/institutes/ssb-heart-and-multispeciality-hospital-121001?${PROFILE}&tab=clinical`);
  await expect(page.getByRole("heading", { name: "Hospital facts (as reported)" })).toBeVisible();
  await expect(page.getByText("NBEMS mandatory disclosure: found on the hospital's site")).toBeVisible();
  const stipend = page.getByRole("row", { name: /^Stipend disclosed, a month/ });
  await expect(stipend).toContainText("₹75,000 / ₹77,000 / ₹80,000 (yr 1/2/3)");
  await expect(stipend).toContainText("the source prints conflicting figures");
  const course = page.getByRole("region", { name: "DNB Anaesthesiology" });
  await expect(course.getByText("derived: computed from the source's figures")).toHaveCount(1);
});

test("seats matrix: a row's Details drawer has the course's terms and the beds as the source prints them", async ({ page }) => {
  await page.goto(`/decide/seats?${PROFILE}&inst=bombay-hospital-452010&course=dnb-anaesthesiology&layout=table`); // phones open on cards
  const matrix = page.locator("#seat-matrix");
  await expect(matrix.getByRole("row", { name: /Bombay Hospital/ })).toContainText("270+");
  await matrix.getByRole("button", { name: /^Details ?: DNB Anaesthesiology/ }).click();
  const drawer = page.getByRole("dialog", { name: "Bombay Hospital" });
  // The row's own stat cells: Fee ≤ ₹1.25 L, Bond "No bond" (no marker: the (i) says why).
  await expect(drawer.getByRole("heading", { name: /: DNB$/ })).toBeVisible();
  for (const v of ["≤ ₹1.25 L", "No bond"]) await expect(drawer).toContainText(v);
  await expect(drawer.getByText("270+", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(matrix.getByRole("button", { name: /^Details ?: DNB Anaesthesiology/ })).toBeFocused();
});

// The Seats matrix (seat lists) and Counselling notices are being rebuilt on the imported 2026 R2 data: assert them there.
test("seat trends and rank scan on the final 2026 R1", async ({ page }) => {
  await page.goto(`/decide/seats?${PROFILE}&tab=trends`);
  await expect(page.locator("#results")).toContainText("of 1,312");

  await page.goto(`/decide/rank-scan?${PROFILE}&scan=42,284&year=2026`);
  await expect(page.getByRole("heading", { name: /2026 R1/ })).not.toContainText("Provisional");
  await expect(page.locator('select[name="year"]')).toHaveValue("2026"); // (getByLabel("Year") also finds "Fee per year, at most")
});

test("related data is linked: institute → course last ranks → allotments → rank scan", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/institutes?${PROFILE}&q=Seth+Gordhandas`);
  await page.getByRole("link", { name: "Seth Gordhandas Sunderdas Medical College", exact: true }).click(); // (not "MCC profile: …")
  await expect(h1(page)).toHaveText("Seth Gordhandas Sunderdas Medical College");
  await expect(page).toHaveURL(/rank=42284/);

  await page.locator("section[aria-labelledby=yours] li").filter({ hasText: "MD Anaesthesiology" }).getByRole("link", { name: "Last ranks" }).first().click();
  await expect(h1(page)).toHaveText("Last ranks");
  const focused = page.locator(`#inst-${SETH_GS}`);
  await expect(focused).toBeVisible();

  await focused.getByRole("link", { name: "Allotments" }).click();
  await expect(h1(page)).toHaveText("Allotments");
  await expect(page.getByText("Showing allotments at")).toBeVisible();

  await page.getByTitle("Scan ranks around this one").filter({ visible: true }).first().click(); // the pane on show
  await expect(h1(page)).toHaveText("Rank scan");
});

test("edit dialog opens with the saved profile and saving keeps the category", async ({ page }) => {
  await page.goto("/decide");
  await page.evaluate(() =>
    localStorage.setItem("medpath.profile", JSON.stringify({ rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY"], degrees: [], quotas: [], states: [], maxFeeLakh: 5, maxBondYears: null })),
  );
  await page.goto("/decide/options"); // full load without params: the bug case
  await expect(page).toHaveURL(/rank=42284/);
  await page.getByRole("button", { name: "Edit your rank and preferences" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("All India Rank")).toHaveValue("42284");
  await expect(dialog.getByLabel("Category")).toHaveValue("OBC");
  await expect(dialog.getByLabel("Anaesthesiology")).toBeChecked();
  await dialog.getByLabel("All India Rank").fill("40000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/rank=40000/);
  await expect(page).toHaveURL(/cat=OBC/);
  await expect(page).toHaveURL(/fee=5/);
});
