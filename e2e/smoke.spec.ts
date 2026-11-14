import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/features/auth/lib/password";
import { freshIp, hasInvite, invited, signIn, signUpOrIn } from "./auth";

// Writes to the database: the waitlist row and the extra accounts here are @seatora.test and deleted afterwards. The
// change-password test signs out every other session of the invited account, so run the suite with --workers=1.
const db = new PrismaClient();
const made: string[] = [];
const testEmail = (kind: string) => `${kind}-${Date.now()}-${randomBytes(3).toString("hex")}@seatora.test`;
test.afterAll(async () => {
  if (made.length) {
    await db.user.deleteMany({ where: { email: { in: made } } }); // sessions cascade
    await db.waitlistEntry.deleteMany({ where: { email: { in: made } } });
  }
  await db.$disconnect();
});

const needsDb = () => test.skip(!process.env.DATABASE_URL, "needs a database");
const needsInvite = () => test.skip(!process.env.DATABASE_URL || !hasInvite, "needs DATABASE_URL, E2E_EMAIL and E2E_PASSWORD");
const alert = (page: Page) => page.locator("form [role=alert]"); // (Next's route announcer is also role=alert)

test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(freshIp()));

test("landing page renders key sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan your rank");
  await expect(page.getByRole("heading", { name: "who's already there?" })).toBeVisible();
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
  await expect(finder.getByText("Residents are being added.").or(finder.getByRole("heading", { level: 3 }).first())).toBeVisible();
});

test("waitlist sign-up succeeds", async ({ page }) => {
  needsDb();
  const email = testEmail("waitlist");
  made.push(email);
  await page.goto("/#waitlist");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Get early access" }).last().click();
  await expect(page.getByText("You're on the list")).toBeVisible();
});

test("sign-up needs the invited email and the invite code; nothing is created otherwise", async ({ page }) => {
  needsInvite();
  const outsider = testEmail("outsider");
  const fill = async (email: string, invite: string, password = "a-long-password") => {
    await page.getByLabel("Name").fill("Test Aspirant");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByLabel("Invite code").fill(invite);
    await page.getByRole("button", { name: "Create account" }).click();
  };
  await page.goto("/signup");
  await fill(invited.email, "a-long-password", "short");
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();

  for (const [email, invite] of [[invited.email, "not-the-invite-code"], [outsider, invited.invite || "not-the-invite-code"]]) {
    await fill(email, invite);
    await expect(alert(page)).toContainText("That email and invite code don't match an invite.");
    await expect(page).toHaveURL(/\/signup$/);
  }
  expect(await db.user.count({ where: { email: outsider } })).toBe(0);
});

test("the invited account signs up (or in), signs out, and signs back in", async ({ page }) => {
  needsInvite();
  await signUpOrIn(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, .+\.$/);
  await expect(page.getByText(invited.email)).toBeVisible();
  await expect(page.locator('header a[href="/account"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/decide/options?rank=42284");
  await expect(page).toHaveURL(/\/login\?next=%2Fdecide%2Foptions%3Frank%3D42284$/);

  await signIn(page, invited.email, "wrong-password");
  await expect(alert(page)).toContainText("Incorrect email or password.");
  await signIn(page);
  await expect(page).toHaveURL(/\/decide/);
});

test("copied cookies stop working after sign-out", async ({ page, browser }) => {
  needsInvite();
  await signUpOrIn(page);
  const copied = await page.context().cookies();
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  const thief = await browser.newContext();
  await thief.addCookies(copied);
  const p = await thief.newPage();
  await p.goto("/account");
  await expect(p).toHaveURL(/\/login$/);
  // Names are checked against the session in the database on every read.
  const names = await p.request.get("/api/v1/colleges/government-medical-college-nagpur-440003/residents");
  expect(names.status()).toBe(401);
  // Decide pages and the API: needs requireDecideAccess() / canUseDecide() wired into the Decide layout and handle().
  await p.goto("/decide");
  await expect(p).toHaveURL(/\/login/);
  expect((await p.request.get("/api/v1/meta")).status()).toBe(401);
  await thief.close();
});

test("change password: checks the current one, keeps this session, signs out the others", async ({ page, browser }) => {
  needsInvite();
  const next = `new-${randomBytes(6).toString("hex")}`;
  try {
    await signUpOrIn(page);
    const other = await browser.newContext({ extraHTTPHeaders: freshIp() });
    const otherPage = await other.newPage();
    await signIn(otherPage);
    await expect(otherPage).toHaveURL(/\/decide/);

    await page.goto("/account");
    const form = page.locator("section[aria-labelledby=password-h]");
    const change = async (current: string, password: string, confirm = password) => {
      await form.getByLabel("Current password", { exact: true }).fill(current);
      await form.getByLabel("New password", { exact: true }).fill(password);
      await form.getByLabel("Confirm new password", { exact: true }).fill(confirm);
      await form.getByRole("button", { name: "Change password" }).click();
    };
    await change(invited.password, "short");
    await expect(form.getByText("Use at least 8 characters")).toBeVisible();
    await change(invited.password, next, `${next}x`);
    await expect(form.getByText("The new passwords don't match")).toBeVisible();
    await change("wrong-password", next);
    await expect(form.getByRole("alert")).toContainText("Current password is incorrect.");
    await expect(form.getByLabel("Current password", { exact: true })).toBeFocused();

    await change(invited.password, next);
    await expect(form.getByRole("status")).toContainText("Password changed. Every other device has been signed out");
    await expect(form.getByLabel("Current password", { exact: true })).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, /); // this one stays signed in

    await otherPage.goto("/account");
    await expect(otherPage).toHaveURL(/\/login$/); // the other one is signed out
    await signIn(otherPage);
    await expect(alert(otherPage)).toContainText("Incorrect email or password.");
    await signIn(otherPage, invited.email, next);
    await expect(otherPage).toHaveURL(/\/decide/);
    await other.close();
  } finally {
    // Back to E2E_PASSWORD for the other tests and the next run.
    await db.user.updateMany({ where: { email: invited.email }, data: { passwordHash: await hashPassword(invited.password), failedLogins: 0, lockedUntil: null } });
  }
});

/** An account that isn't on the allowlist: its right password says "no access", which a locked account never says. */
async function outsiderAccount() {
  const email = testEmail("lock");
  made.push(email);
  await db.user.create({ data: { name: "Lock Test", email, passwordHash: await hashPassword("a-long-password") } });
  return email;
}

test("an account locks after 5 failed sign-ins", async ({ page }) => {
  needsDb();
  const email = await outsiderAccount();
  await signIn(page, email, "a-long-password");
  await expect(alert(page)).toContainText("This account doesn't have access.");
  for (let i = 0; i < 5; i++) {
    await signIn(page, email, `wrong-${i}`);
    await expect(alert(page)).toContainText("Incorrect email or password");
  }
  // The right password is refused while locked.
  await signIn(page, email, "a-long-password");
  await expect(alert(page)).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("parallel wrong guesses still trigger the lock", async ({ page, browser }) => {
  needsDb();
  const email = await outsiderAccount();
  const ip = freshIp();
  await page.context().setExtraHTTPHeaders(ip);
  // 8 tabs from one IP submit wrong passwords at the same moment.
  const tabs = await Promise.all(Array.from({ length: 8 }, async () => {
    const p = await (await browser.newContext({ extraHTTPHeaders: ip })).newPage();
    await p.goto("/login");
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Password").fill("wrong-password");
    return p;
  }));
  await Promise.all(tabs.map((p) => p.getByRole("button", { name: "Sign in" }).click()));
  await Promise.all(tabs.map((p) => expect(alert(p)).toContainText("Incorrect email or password")));
  await Promise.all(tabs.map((p) => p.context().close()));

  await signIn(page, email, "a-long-password");
  await expect(alert(page)).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("v2 home: rank card opens the planner with that rank", async ({ page }) => {
  await page.goto("/v2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your NEET PG rank, turned into a plan.");
  await page.getByRole("button", { name: "Show my colleges" }).click();
  await expect(page.getByText("Enter a rank between 1 and 3,00,000.")).toBeVisible();
  await page.getByLabel("Your All India Rank").fill("42,284");
  await page.getByText("OBC", { exact: true }).click();
  await page.getByRole("button", { name: "Show my colleges" }).click();
  // Signed out with the gate on, the planner asks for sign-in first and keeps the rank for after.
  await expect(page).toHaveURL(/\/decide\/options\?rank=42284&cat=OBC|\/login\?next=%2Fdecide%2Foptions%3Frank%3D42284%26cat%3DOBC/);
});
