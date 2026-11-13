import { expect, test } from "@playwright/test";

test("landing page renders key sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your PG seat");
  await expect(page.getByText("Demo data · illustrative only")).toBeVisible();
  // Every in-page link must point at a section that exists.
  const hashes = await page.locator('a[href^="/#"], a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!.split("#")[1]));
  for (const id of new Set(hashes)) await expect(page.locator(`#${id}`), `#${id}`).toBeAttached();
});

test("waitlist form validates email", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByRole("button", { name: "Get early access" }).last().click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});
