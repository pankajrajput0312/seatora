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
  await page.getByLabel("Adjust your rank").fill("200000");
  await expect(table.getByText("Inside last closing rank")).toHaveCount(0);
});

test("typing a rank commits on Enter without snapping mid-typing", async ({ page }) => {
  await page.goto("/");
  const input = page.locator("#preview input[inputmode=numeric]");
  await input.fill("");
  await input.pressSequentially("5000");
  await expect(input).toHaveValue("5000");
  await input.press("Enter");
  await expect(input).toHaveValue("5,000");
});

test("waitlist sign-up succeeds", async ({ page }, info) => {
  test.skip(!process.env.DATABASE_URL, "needs a database");
  await page.goto("/#waitlist");
  await page.getByPlaceholder("you@example.com").fill(`e2e-${Date.now()}-${info.project.name}@example.com`);
  await page.getByRole("button", { name: "Get early access" }).last().click();
  await expect(page.getByText("You're on the list")).toBeVisible();
});
