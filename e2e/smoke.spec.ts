import { expect, test } from "@playwright/test";

test("landing page renders key sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your PG seat");
  await expect(page.getByRole("heading", { name: "Find residents at every hospital, and reach them directly." })).toBeVisible();
  // Every in-page link must point at a section that exists.
  const hashes = await page.locator('a[href^="/#"], a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!.split("#")[1]));
  for (const id of new Set(hashes)) await expect(page.locator(`#${id}`), `#${id}`).toBeAttached();
});

test("waitlist form validates email", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByRole("button", { name: "Get early access" }).last().click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("resident finder takes a rank and shows hospitals or an honest empty state", async ({ page }) => {
  await page.goto("/");
  const finder = page.locator("#preview");
  const input = finder.locator("input[inputmode=numeric]");
  await input.pressSequentially("5000");
  await input.blur();
  await expect(input).toHaveValue("5,000");
  await expect(finder.getByText("No residents added yet.").or(finder.getByRole("heading", { level: 3 }).first())).toBeVisible();
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

test("parallel wrong guesses still trigger the lock", async ({ page, browser }, info) => {
  test.skip(!process.env.DATABASE_URL, "needs a database");
  const email = `race-${Date.now()}-${info.project.name}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Race Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);

  // 8 tabs submit wrong passwords at the same moment.
  const tabs = await Promise.all(Array.from({ length: 8 }, async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password").fill("wrong-password");
    return p;
  }));
  await Promise.all(tabs.map((p) => p.getByRole("button", { name: "Sign in" }).click()));
  await Promise.all(tabs.map((p) => expect(p.locator("form [role=alert]")).toBeVisible()));

  const p = tabs[0];
  await p.getByLabel("Password").fill("a-long-password");
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p.locator("form [role=alert]")).toContainText("Incorrect email or password");
  await expect(p).toHaveURL(/\/login$/);
});
