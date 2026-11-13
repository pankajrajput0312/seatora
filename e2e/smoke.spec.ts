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

test("sign up, sign out and sign back in", async ({ page }, info) => {
  test.skip(!process.env.DATABASE_URL, "needs a database");
  const email = `auth-${Date.now()}-${info.project.name}@example.com`;

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Test Aspirant");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();

  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Test Aspirant.");
  await expect(page.locator('header a[href="/account"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("account locks after 5 failed sign-ins", async ({ page }, info) => {
  test.skip(!process.env.DATABASE_URL, "needs a database");
  const email = `lock-${Date.now()}-${info.project.name}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Lock Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Password").fill(`wrong-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("Incorrect email or password");
  }
  // Correct password is refused while locked.
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login$/);
});
