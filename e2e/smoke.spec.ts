import { expect, test } from "@playwright/test";

test("landing page renders key sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your PG seat");
  await expect(page.getByText("Demo data · illustrative only", { exact: true })).toBeVisible();
  // Every in-page link must point at a section that exists.
  const hashes = await page.locator('a[href^="/#"], a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!.split("#")[1]));
  for (const id of new Set(hashes)) await expect(page.locator(`#${id}`), `#${id}`).toBeAttached();
});

test("waitlist form validates email", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByRole("button", { name: "Get early access" }).last().click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("rank slider re-labels rows against previous closing ranks", async ({ page }) => {
  await page.goto("/");
  const table = page.locator("#preview table");
  await page.getByLabel("Adjust your rank").fill("1000");
  await expect(table.getByText("Beyond last closing rank")).toHaveCount(0);
  await page.getByLabel("Adjust your rank").fill("30000");
  await expect(table.getByText("Inside last closing rank")).toHaveCount(0);
});
