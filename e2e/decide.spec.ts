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
    "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/rank-journey", "/decide/fees", "/decide/seats", "/decide/seats?tab=trends", "/decide/counselling",
    "/decide/institutes/ssb-heart-and-multispeciality-hospital-121001?tab=clinical"]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" }), path).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
  // The Seats matrix's and Allotments' Display menus open on screen, every checkbox visible.
  for (const path of ["/decide/seats", "/decide/allotments"]) {
    await page.goto(`${path}?${PROFILE}`);
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

test("overview leads with what's open now and the round's numbers, each opening that Options view", async ({ page }) => {
  await page.goto(`/decide?${PROFILE}`);
  await expect(page.getByRole("region", { name: "MCC counselling 2026 now" })).toBeVisible();
  const numbers = page.getByRole("region", { name: "Round 2 seats in your courses" });
  await expect(numbers).toContainText("Options with Round 2 seats1,065708 in the clear vacancy list, 357 virtual only.");
  await numbers.getByRole("link", { name: "Open the Round 2 view" }).click();
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
  await expect(summary).toContainText(/^1,065 options have Round 2 seats in your courses: 708 in the clear vacancy list, 357 virtual only; 103 with newly added seats, \d+ new: no past allotment\./);
  await expect(page.getByRole("link", { name: "All 1,065 options" })).toBeVisible();
  const count = page.locator("#options-count");
  await expect(count).toContainText("Showing 1–25 of 1,065 options");
  await expect(page.getByText(/that closed before your rank in every round of .* are included/)).toBeVisible();

  // New options: their own chip; a real row whose star saves it under its option id.
  const fresh = Number((await summary.getByRole("link", { name: /new: no past allotment/ }).textContent())!.match(/[\d,]+/)![0].replace(",", ""));
  await page.getByRole("link", { name: new RegExp(`^New: no past allotment ${fresh} options$`) }).click();
  await expect(count).toContainText(`of ${fresh} options`);
  const row = page.locator("[data-item]").filter({ visible: true }).first();
  await expect(row).toContainText("New: no past allotment");
  await row.getByRole("button", { name: /^In Round 2/ }).click();
  await page.goto(`/decide/choices?${PROFILE}`);
  await expect(page.getByRole("list", { name: /choice list, 1 item/ })).toContainText("New: no past allotment");

  // Also options without R2 seats; then the view of every option with past allotments, closed hidden.
  await page.goto(`/decide/options?${PROFILE}`);
  await page.getByRole("link", { name: "Also show options without Round 2 seats" }).click();
  await expect(count).toContainText(`of ${formatN(1282 + fresh)} options`);
  await page.getByRole("link", { name: "Every option with past allotments instead (closed hidden)" }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(count).toContainText("of 641 options");

  // From the New chip, the other view drops that label (it has no new options) instead of opening empty.
  await page.goto(`/decide/options?${PROFILE}&reach=new`);
  await page.getByRole("link", { name: "Every option with past allotments instead (closed hidden)" }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(page).not.toHaveURL(/reach=/);
  await expect(count).toContainText("of 641 options");
  // The summary's new link opens every new option, whatever the seats filter.
  await page.goto(`/decide/options?${PROFILE}&seats=virtual`);
  await page.getByRole("region", { name: "2026 R2 seats in your courses" }).getByRole("link", { name: /new: no past allotment/ }).click();
  await expect(count).toContainText(`of ${fresh} options`);
  // Hide them by keyboard: the same link, now "Show them", keeps focus.
  await page.goto(`/decide/options?${PROFILE}`);
  await page.getByRole("link", { name: "Hide them" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/closed=0/);
  await expect(page.getByRole("link", { name: "Show them" })).toBeFocused();
});
const formatN = (n: number) => n.toLocaleString("en-IN");

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
  await page.locator("summary", { hasText: "State" }).click();
  await page.getByRole("checkbox", { name: "Maharashtra" }).check();
  await page.getByRole("checkbox", { name: "Karnataka" }).check();
  await page.locator("summary", { hasText: "State" }).click(); // close it: on a phone the open list covers Apply
  await page.getByRole("button", { name: "Apply" }).click();
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
  for (const v of ["20,132", "R1, Open seat", "33,685", "Stray, Open seat"]) await expect(row).toContainText(v);
  await expect(row).not.toContainText("Provisional");

  // GMC Nagpur 2026 R1 MD Anaesthesiology: OBC closing 17,213 and 12 allotments (all categories).
  await page.goto(`/decide/compare?${new URLSearchParams({ ids: [OPT_KOKILA_ANAES, OPT_GMC_NAGPUR].join(",") })}&${PROFILE}`);
  const table = page.getByRole("table", { name: "Comparison of 2 options" });
  for (const v of ["20,132", "17,213", "R1, OBC seat", "2026 R1 closing", "Leaving penalty / Round 2 forfeit"]) await expect(table).toContainText(v);
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

test("saved ids under a retired college key move to the key the college has now, once, with a notice", async ({ page }) => {
  // AMRI Hospitals Mukundapur: its key before the round-2 bundle (key_aliases.json) and the one it has now.
  const id = (k: string) => `${k}~DNB~ANAESTHESIOLOGY~DNB Quota`;
  const [oldId, newId] = [id("AMRIHOSPITALSMUKUNDAPUR223BARAKHOLALANEB#700099"), id("AMRIHOSPITALSWESTBENGALAMRIHOSPITALSMUKU#700099")];
  await page.goto(`/decide/choices?${PROFILE}`);
  await page.evaluate((oldId) => {
    const item = { id: oldId, institute: "AMRI Hospitals (old name)", slug: "amri-hospitals-700099", state: "West Bengal", course: "DNB Anaesthesiology", courseSlug: "dnb-anaesthesiology", quota: "DNB Quota", reachLabel: "", closedEveryRound: false };
    localStorage.setItem("medpath.choices", JSON.stringify({ lists: [{ id: "r2", name: "Round 2 · 2026", items: [item], typedIds: [oldId] }], activeId: "r2" }));
    localStorage.setItem("medpath.compare", JSON.stringify([oldId]));
  }, oldId);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "1 saved option was renamed after MCC's college names were cleaned up." })).toBeVisible();
  const stored = await page.evaluate(() => [JSON.parse(localStorage.getItem("medpath.choices")!), JSON.parse(localStorage.getItem("medpath.compare")!)]);
  expect([stored[0].lists[0].items[0].id, stored[0].lists[0].typedIds, stored[1]]).toEqual([newId, [newId], [newId]]);
  expect(stored[0].lists[0].items[0].slug).not.toBe("amri-hospitals-700099");
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
  // Comboboxes: the Display menu has checkboxes with the same names.
  await page.getByRole("combobox", { name: "Seat category" }).selectOption("OBC");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/acat=OBC/);
  await expect(table).toContainText("17,213");

  // The quota filter is `aq`, never her profile's `quota`; "30,000" is a rank.
  await page.goto(`/decide/allotments?${PROFILE}&from=30,000&to=50,000`);
  await expect(page.getByLabel("Rank from")).toHaveValue("30,000");
  await expect(page.locator("#results")).not.toContainText("2,09,566");
  await page.getByRole("combobox", { name: "Quota" }).selectOption("All India");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/aq=All\+India/);
  await expect(page).not.toHaveURL(/[?&]quota=/);
  await page.goto(`/decide/allotments?${PROFILE}&from=abc`);
  await expect(page.getByText("That range was not applied.")).toBeVisible(); // (Next's route announcer is also role=alert)
});

test("rank journey: 2023 rank 23 in R1 at LTMMC, upgraded in R2 to Seth GS on choice 1; Allotments' new columns, CSV and links", async ({ page }) => {
  await page.goto(`/decide/rank-journey?${PROFILE}`);
  await expect(page.getByLabel("All India Rank")).toHaveValue("42284"); // her rank, the newest year
  await expect(page.getByLabel("Year")).toHaveValue("2026");

  await page.goto(`/decide/rank-journey?${PROFILE}&air=23&year=2023`);
  const journey = page.getByRole("region", { name: "Rank 23, 2023" });
  await expect(journey.getByRole("row", { name: /^2023 R1/ })).toContainText("Allotted");
  const r2 = journey.getByRole("row", { name: /^2023 R2/ });
  for (const v of ["Seth Gordhandas Sunderdas Medical College", "Upgraded", "General", "LOKMANYA TILAK MEDICAL COLLEGE MUMBAI", "MD General Medicine · All India · reported"]) await expect(r2).toContainText(v);
  await expect(page.getByText("No allotment to this rank in the R3,")).toBeVisible();

  // Allotments: candidate category, choice no., status and previous seat; a column hidden under Display; the CSV.
  await page.goto(`/decide/allotments?${PROFILE}&year=2023&round=R2&from=23&to=23`);
  const table = page.getByRole("region", { name: "Allotments", exact: true });
  await expect(table.getByRole("row").nth(1)).toContainText("All IndiaOpenGeneral1Upgraded");
  await page.getByText("Display").click();
  await page.getByRole("checkbox", { name: "Previous seat" }).uncheck();
  await expect(table.getByRole("columnheader", { name: /Previous seat/ })).toBeHidden();
  await page.getByRole("checkbox", { name: "Previous seat" }).check();
  const csv = await (await page.request.get(await page.getByRole("link", { name: /Download CSV/ }).getAttribute("href") ?? "")).text();
  expect(csv).toContain(",Candidate category,Choice no.,Status,");
  expect(csv).toContain(",All India,Open,General,1,Upgraded,Seth Gordhandas Sunderdas Medical College,");
  await table.getByRole("link", { name: /^Journey/ }).click();
  await expect(page).toHaveURL(/air=23&year=2023/);

  await page.goto(`/decide/rank-scan?${PROFILE}&scan=23&year=2023&w=100`);
  await page.getByRole("region", { name: "2023 R2 allotments" }).getByRole("link", { name: "23", exact: true }).click();
  await expect(h1(page)).toHaveText("Rank journey");
});

test("institute page: MCC address, terms with their sources, paginated allotments", async ({ page }) => {
  await page.goto(`/decide/institutes/${KOKILA_NM}?${PROFILE}&tab=fees`);
  await expect(page.getByText(/Navi Mumbai/).first()).toBeVisible();
  // DNB, the fee table's DNB Quota seats: the NBEMS maximum fee and minimum stipend each year (labelled, never the
  // college's figures), the whole course, and "No bond" from the NBEMS rule's record; one source numbering for the block.
  const dnb = page.getByRole("region", { name: "DNB", exact: true });
  const quota = dnb.getByRole("region", { name: "DNB Quota seats" });
  const y1 = quota.getByRole("row", { name: /^Year 1/ });
  for (const v of ["₹1,25,000", "NBEMS maximum", "₹43,000", "NBEMS minimum"]) await expect(y1).toContainText(v);
  await expect(quota.getByRole("row", { name: /^Whole course/ })).toContainText("₹3,75,000");
  await expect(quota.getByRole("link", { name: /^Source 3: NBEMS annual course fee \(ceiling, no GST\)/ }).first()).toHaveAttribute("href", /natboard\.edu\.in/);
  await expect(dnb).toContainText("No bond (NBEMS rule)");
  await expect(dnb).not.toContainText("GST to NBEMS");
  await expect(dnb.getByRole("list", { name: "Sources, DNB, bond and penalties" }).getByRole("listitem").first()).toHaveText(/^4/);

  await page.goto(`/decide/institutes/${SETH_GS}?${PROFILE}&tab=allotments`);
  const results = page.locator("#results");
  await expect(results).toContainText("1–50 of 1,001");
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(results).toContainText("51–100 of 1,001");
  await expect(results).toBeFocused();
});

test("fees: a fee in the profile's own words shows no figure anywhere; MCC's Round 2 forfeit from the fee table", async ({ page }) => {
  // Chettinad: the MCC profile gives ₹3 L–₹48 L by specialty, so the fee table is verbatim: words and link, no ₹ fee.
  await page.goto(`/decide/institutes/chettinad-hospital-research-institute-603103?${PROFILE}`);
  await expect(page.getByText(/MD\/MS · Fee see terms/)).toBeVisible();
  await page.goto(`/decide/institutes/chettinad-hospital-research-institute-603103?${PROFILE}&tab=fees`);
  const group = page.getByRole("region", { name: "MD/MS", exact: true }).getByRole("region", { name: "Deemed/Paid seats" });
  await expect(group).toContainText("Seatora shows no fee figure here");
  await expect(group.getByRole("columnheader", { name: "Fee that year" })).toHaveCount(0);
  await expect(group.getByRole("link", { name: /MCC institute profile, read/ })).toHaveAttribute("href", /mcc\.admissions\.nic\.in/);
  // Goa MC: ₹70,324 at admission, later years not stated: no whole-course figure; the Round 2 forfeit ₹8,432.
  await page.goto(`/decide/institutes/goa-medical-college-403202?${PROFILE}`);
  await expect(page.getByText(/MD\/MS · Fee ₹70,324 at admission, later yrs not stated/)).toBeVisible();
  await page.goto(`/decide/institutes/goa-medical-college-403202?${PROFILE}&tab=fees`);
  const md = page.getByRole("region", { name: "MD/MS", exact: true });
  await expect(md.getByRole("row", { name: /^Whole course/ })).toHaveCount(0);
  await expect(md).toContainText("₹8,432 forfeited if you resign or don't join from Round 2");
  await expect(md.getByRole("definition").filter({ hasText: "What MCC lets the college keep" })).toContainText("₹8,432");
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
  await page.goto(`/decide/seats?${PROFILE}&inst=bombay-hospital-452010&course=dnb-anaesthesiology`);
  const matrix = page.locator("#seat-matrix");
  await expect(matrix.getByRole("row", { name: /Bombay Hospital/ })).toContainText("270+");
  await matrix.getByRole("button", { name: /^Details ?: DNB Anaesthesiology/ }).click();
  const drawer = page.getByRole("dialog", { name: "Bombay Hospital" });
  await expect(drawer).toContainText("DNB · Fee up to ₹1.25 L/yr (NBEMS max)");
  await expect(drawer).toContainText("No bond (NBEMS rule");
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
