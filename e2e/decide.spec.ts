import { expect, test } from "./auth";

// Runs on the real MCC import (spot values: neetpg-planner docs/HANDOFF_CONTEXT.md §7), signed in to the invited account
// (e2e/auth.ts). Without a database Decide only shows "Data unavailable", so the whole file is skipped.
test.skip(!process.env.DATABASE_URL, "needs the MCC data in Postgres (DATABASE_URL)");

const PROFILE = "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE";

test("plan routes render real data, never demo data", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [path, h1] of [
    ["/decide", "Overview"], ["/decide/options", "Options"], ["/decide/choices", "Choices"], ["/decide/compare", "Compare"],
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
    "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/fees", "/decide/seats?tab=trends", "/decide/counselling"]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" }), path).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});

test("set profile, label options, and reorder choices with the keyboard only", async ({ page }) => {
  await page.goto("/decide/options");
  await page.getByRole("link", { name: "Set your rank" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("All India Rank").fill("42284");
  await dialog.getByLabel("Category").selectOption("OBC");
  await dialog.getByLabel("Anaesthesiology").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/rank=42284/);
  await expect(page.getByText("Reached in 2026 R1").filter({ visible: true }).first()).toBeVisible();

  const stars = page.locator('button[aria-pressed="false"][aria-label^="In Round 2"]').filter({ visible: true });
  for (let i = 0; i < 3; i++) await stars.first().click(); // a clicked star becomes pressed, so .first() moves to the next row

  await page.goto(`/decide/choices?${PROFILE}`);
  const list = page.getByRole("list", { name: /Round 2 · 2026 choice list, 3 items/ });
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

// ---- Options, choices and compare on the real MCC data (her profile: AIR 42,284, OBC, Anaesthesiology + Family Medicine) ----
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPT_KOKILA_ANAES = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710~DNB~ANAESTHESIOLOGY~DNB Quota";
const OPT_KOKILA_FM = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710~DNB~FAMILYMEDICINE~DNB Quota";
const OPT_GMC_NAGPUR = "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT#440003~MD~ANAESTHESIOLOGY~All India";

test("options: her 680 options in the open quotas (25 at a time), Show more focuses the first new row, two ticked states both apply", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/options?${PROFILE}`);
  await expect(page.getByRole("link", { name: "All 680 options" })).toBeVisible();
  const count = page.locator("#options-count");
  await expect(count).toContainText("Showing 1–25 of 680 options");
  await expect(page.locator("[data-item]").filter({ visible: true })).toHaveCount(25); // one page, never the whole list
  await page.getByRole("button", { name: "Show 25 more" }).click();
  await expect(count).toContainText("Showing 1–50 of 680 options");
  await expect(page.locator('[data-item="26"]').filter({ visible: true })).toBeFocused();

  // Multi-select: both ticked states apply (repeated st params), and stay ticked.
  await page.locator("summary", { hasText: "State" }).click();
  await page.getByRole("checkbox", { name: "Maharashtra" }).check();
  await page.getByRole("checkbox", { name: "Karnataka" }).check();
  await page.locator("summary", { hasText: "State" }).click(); // close it: on a phone the open list covers Apply
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/st=Maharashtra/);
  await expect(page).toHaveURL(/st=Karnataka/);
  await expect(count).toContainText("of 144 options");
  await expect(page.locator("summary", { hasText: "State" })).toContainText("2 selected");
});

test("options and compare: official closings with their seat category, 2026 R1 final", async ({ page }) => {
  // Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota: 2026 R1 20,132 (Open seat, final); 2025 deepest 33,685 (stray).
  await page.goto(`/decide/options?${PROFILE}&q=Kokilaben&closed=1`);
  const row = page.locator("[data-item]").filter({ visible: true }).filter({ hasText: "DNB Anaesthesiology" })
    .filter({ has: page.getByRole("link", { name: "Kokilaben Dhirubhai Ambani Hospital", exact: true }) });
  for (const v of ["20,132", "R1, Open seat", "33,685", "Stray, Open seat"]) await expect(row).toContainText(v);
  await expect(row).not.toContainText("Provisional");

  // GMC Nagpur 2026 R1 MD Anaesthesiology: OBC closing 17,213 and 12 allotments (all categories).
  await page.goto(`/decide/compare?${new URLSearchParams({ ids: [OPT_KOKILA_ANAES, OPT_GMC_NAGPUR].join(",") })}&${PROFILE}`);
  const table = page.getByRole("table", { name: "Comparison of 2 options" });
  for (const v of ["20,132", "17,213", "R1, OBC seat", "2026 R1 closing", "Resign or don't join from Round 2 (MCC)"]) await expect(table).toContainText(v);
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
  await page.reload();
  const list = page.getByRole("list", { name: /Round 2 · 2026 choice list, 3 items/ });
  // All three closed before AIR 42,284 on Open/OBC seats: the stored "Reached in 2026 R1" is replaced.
  await expect(list.getByText("Closed before your rank", { exact: true })).toHaveCount(3);
  await expect(list.getByText(/\(when added\)/)).toHaveCount(0);

  await page.getByRole("button", { name: "Remove Government Medical College, Nagpur, MD Anaesthesiology" }).click();
  await page.getByRole("button", { name: /^Round 3 · 2026/ }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(list).toBeVisible();
  await expect(page.getByRole("button", { name: /^Round 3 · 2026/ })).toContainText("(0)");

  const typedUpTo = page.getByLabel("Typed into the MCC portal up to #");
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
  await page.goto(`/decide/last-ranks?${PROFILE}&course=dnb-anaesthesiology&lcat=Open&lquota=DNB+Quota&inst=${KOKILA_NM}`);
  const kokila = page.locator(`#inst-${KOKILA_NM}`);
  await expect(kokila).toBeVisible();
  for (const v of ["21,699", "25,059", "29,892", "33,685", "20,132"]) await expect(kokila).toContainText(v);
  await expect(page.getByRole("columnheader", { name: "2026", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Provisional/ })).toHaveCount(0);

  // Seth GS MD Anaesthesiology, All India, 2026 R1: OBC 11,842 and Open 8,502, both with 20 allotments (all categories).
  await page.goto(`/decide/last-ranks?${PROFILE}&course=md-anaesthesiology&lcat=OBC&lquota=All+India&inst=${SETH_GS}`);
  await expect(page.locator(`#inst-${SETH_GS}`)).toContainText("11,842 (20)");
  await page.getByLabel("Seat category").selectOption("Open");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/lcat=Open/);
  await expect(page.locator(`#inst-${SETH_GS}`)).toContainText("8,502 (20)");
});

test("allotments: own filter keys, comma ranks, pages, and GMC Nagpur 2026 R1", async ({ page }) => {
  // GMC Nagpur 2026 R1 MD Anaesthesiology: 12 allotments; the deepest OBC seat went to 17,213.
  await page.goto(`/decide/allotments?${PROFILE}&inst=${GMC_NAGPUR}&course=md-anaesthesiology&year=2026&round=R1`);
  await expect(page.locator("#results")).toContainText("1–12 of 12");
  const table = page.getByRole("region", { name: "Allotments", exact: true });
  await expect(table.getByText("Provisional")).toHaveCount(0); // 2026 R1 is final
  await page.getByLabel("Seat category").selectOption("OBC");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/acat=OBC/);
  await expect(table).toContainText("17,213");

  // The quota filter is `aq`, never her profile's `quota`; "30,000" is a rank.
  await page.goto(`/decide/allotments?${PROFILE}&from=30,000&to=50,000`);
  await expect(page.getByLabel("Rank from")).toHaveValue("30,000");
  await expect(page.locator("#results")).not.toContainText("2,09,566");
  await page.getByLabel("Quota").selectOption("All India");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/aq=All\+India/);
  await expect(page).not.toHaveURL(/[?&]quota=/);
  await page.goto(`/decide/allotments?${PROFILE}&from=abc`);
  await expect(page.getByText("That range was not applied.")).toBeVisible(); // (Next's route announcer is also role=alert)
});

test("institute page: MCC address, terms with their sources, paginated allotments", async ({ page }) => {
  await page.goto(`/decide/institutes/${KOKILA_NM}?${PROFILE}&tab=fees`);
  await expect(page.getByText(/Navi Mumbai/).first()).toBeVisible();
  // DNB: the NBEMS fee each year, the declared stipend by year, and no bond term = "not declared" with the NBEMS rule.
  const dnb = page.getByRole("region", { name: "DNB", exact: true });
  await expect(dnb.getByRole("table")).toContainText("₹1,25,000");
  for (const v of ["₹63,000", "₹64,000", "₹65,000", "₹3,75,000"]) await expect(dnb).toContainText(v);
  await expect(dnb).toContainText("No bond declared to MCC in the profile fields Seatora imports. NBEMS rule");
  await expect(dnb.getByRole("link", { name: /^Source 1: NBEMS fee notice/ }).first()).toHaveAttribute("href", /natboard\.edu\.in/);

  await page.goto(`/decide/institutes/${SETH_GS}?${PROFILE}&tab=allotments`);
  const results = page.locator("#results");
  await expect(results).toContainText("1–50 of 1,001");
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(results).toContainText("51–100 of 1,001");
  await expect(results).toBeFocused();
});

// The Seats matrix (seat lists) and Counselling notices are being rebuilt on the imported 2026 R2 data: assert them there.
test("seat trends and rank scan on the final 2026 R1", async ({ page }) => {
  await page.goto(`/decide/seats?${PROFILE}&tab=trends`);
  await expect(page.locator("#results")).toContainText("of 1,360");

  await page.goto(`/decide/rank-scan?${PROFILE}&scan=42,284&year=2026`);
  await expect(page.getByRole("heading", { name: /2026 R1/ })).not.toContainText("Provisional");
  await expect(page.getByLabel("Year")).toHaveValue("2026");
});

test("related data is linked: institute → course last ranks → allotments → rank scan", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/institutes?${PROFILE}&q=Seth+Gordhandas`);
  await page.getByRole("link", { name: "Seth Gordhandas Sunderdas Medical College" }).click();
  await expect(h1(page)).toHaveText("Seth Gordhandas Sunderdas Medical College");
  await expect(page).toHaveURL(/rank=42284/);

  await page.locator("section[aria-labelledby=yours] li").filter({ hasText: "MD Anaesthesiology" }).getByRole("link", { name: "Last ranks" }).first().click();
  await expect(h1(page)).toHaveText("Last ranks");
  const focused = page.locator(`#inst-${SETH_GS}`);
  await expect(focused).toBeVisible();

  await focused.getByRole("link", { name: "Allotments" }).click();
  await expect(h1(page)).toHaveText("Allotments");
  await expect(page.getByText("Showing allotments at")).toBeVisible();

  await page.getByTitle("Scan ranks around this one").first().click();
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
