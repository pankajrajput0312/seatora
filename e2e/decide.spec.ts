import { expect, test } from "@playwright/test";

const PROFILE = "rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE";

test("every Decide route renders with the demo banner", async ({ page }) => {
  test.setTimeout(120_000);
  for (const [path, h1] of [
    ["/decide", "Overview"], ["/decide/options", "Options"], ["/decide/choices", "Choices"], ["/decide/compare", "Compare"],
    ["/decide/rank-scan", "Rank scan"], ["/decide/last-ranks", "Last ranks"], ["/decide/seats?tab=trends", "Seats"],
    ["/decide/counselling", "Counselling"], ["/decide/institutes", "Institutes"], ["/decide/allotments", "Allotments"],
    ["/decide/fees", "Fees, stipend and bond"], ["/decide/institutes/example-government-medical-college-nagpur-440003?tab=allotments", "Example Government Medical College, Nagpur"], ["/decide/institutes/example-government-medical-college-nagpur-440003", "Example Government Medical College, Nagpur"],
  ]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}${PROFILE}`);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(h1);
    await expect(page.getByText("Demo data — illustrative only.")).toBeVisible();
  }
});

test("set profile, label options, and reorder choices with the keyboard only", async ({ page }) => {
  await page.goto("/decide/options");
  await page.getByRole("link", { name: "Set your rank" }).first().click();
  await page.getByLabel("All India Rank").fill("42284");
  await page.getByLabel("Category").selectOption("OBC");
  await page.getByLabel("Anaesthesiology").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/rank=42284/);
  await expect(page.getByText("Reached in 2026 R1").filter({ visible: true }).first()).toBeVisible();

  const stars = page.getByRole("button", { name: /^Add to Round 2 · 2026/ });
  for (let i = 0; i < 3; i++) await stars.first().click(); // each click turns that star off-list, next "Add" is the next row

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

  await page.getByRole("button", { name: new RegExp(`^Move ${before[2]}.* up$`) }).click();
  await expect.poll(names).toEqual([before[1], before[2], before[0]]);
});

test("related data is linked: institute → course last ranks → allotments → rank scan", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/decide/institutes?${PROFILE}`);
  await page.getByRole("link", { name: "Example Multispeciality Hospital, Navi Mumbai" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Example Multispeciality Hospital, Navi Mumbai");
  await expect(page).toHaveURL(/rank=42284/);

  await page.locator("section[aria-labelledby=yours]").getByRole("link", { name: "Last ranks" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Last ranks");
  const focused = page.locator("#inst-example-multispeciality-hospital-navi-mumbai-410210");
  await expect(focused).toBeVisible();

  await focused.getByRole("link", { name: "Allotments" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Allotments");
  await expect(page.getByText("Showing allotments at")).toBeVisible();

  await page.getByTitle("Scan ranks around this one").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rank scan");
});
