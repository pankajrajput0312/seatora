import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { freshIp, openAccess, signIn, signUp } from "./auth";

// SEATORA_OPEN_ACCESS=1 (on the server and here): anyone signs up with no invite code and lands on /decide with Options
// and Residents. Asserts counts only, never names. The accounts made here are @seatora.test and deleted afterwards.
test.skip(!openAccess || !process.env.DATABASE_URL, "needs SEATORA_OPEN_ACCESS=1 and DATABASE_URL");

const db = new PrismaClient();
const made: string[] = [];
const fresh = () => {
  const email = `open-${Date.now()}-${randomBytes(3).toString("hex")}@seatora.test`;
  made.push(email);
  return email;
};
test.afterAll(async () => {
  if (made.length) await db.user.deleteMany({ where: { email: { in: made } } });
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(freshIp()));
const onDecide = (url: string) => new URL(url).pathname === "/decide" && new URL(url).host.startsWith("localhost");

test("a brand-new account signs up without a code, lands on /decide and sees Options and Residents' names", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Invite code")).toHaveCount(0);
  const email = fresh();
  await signUp(page, email, "a-long-password");
  await expect.poll(() => onDecide(page.url())).toBe(true);

  await page.goto("/decide/options?rank=42284&cat=OBC");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Options");
  await page.goto("/decide/residents?course=all");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Residents");
  await expect(page.locator("#results")).toHaveText(/^[\d,]+ residents/);
  const rows = page.getByRole("table").locator("tbody tr").or(page.getByRole("region", { name: "Residents", exact: true }).getByRole("listitem"));
  expect(await rows.count()).toBeGreaterThan(0);

  // Not the owner: no list of everyone's requests.
  await page.goto("/decide/requests");
  await expect(page.locator("#mine-h")).toBeVisible();
  await expect(page.locator("section[aria-labelledby=all-h]")).toHaveCount(0);
});

test("?next= can't leave the site: sign-up and sign-in land on /decide", async ({ page, context }) => {
  const email = fresh();
  await signUp(page, email, "a-long-password", "//evil.test/x");
  await expect.poll(() => onDecide(page.url())).toBe(true);
  for (const next of ["https://evil.test", "/\\evil.test", "/.//evil.test", "javascript:alert(1)"]) {
    await context.clearCookies();
    await page.goto(`/login?${new URLSearchParams({ next })}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a-long-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.poll(() => onDecide(page.url()), next).toBe(true);
  }
  await context.clearCookies();
  await signIn(page, email, "a-long-password");
  await expect.poll(() => onDecide(page.url())).toBe(true);
});

test("an owner address can't be claimed by signing up", async ({ page }) => {
  const owner = (process.env.SEATORA_OWNER_EMAILS ?? "").split(",")[0]?.trim();
  test.skip(!owner, "needs SEATORA_OWNER_EMAILS");
  if (!(await db.user.count({ where: { email: owner.toLowerCase() } }))) made.push(owner.toLowerCase()); // cleaned up if the guard fails
  await signUp(page, owner, "a-long-password");
  await expect(page.locator("form [role=alert]")).toContainText("This email can't be used to sign up.");
  expect(await db.user.count({ where: { email: owner.toLowerCase(), name: "E2E Aspirant" } })).toBe(0);
});

test("signed out: pages 307 to /login, the API 401", async ({ request }) => {
  const page = await request.get("/decide/residents", { maxRedirects: 0 });
  expect(page.status()).toBe(307);
  expect(page.headers().location).toMatch(/\/login\?next=%2Fdecide%2Fresidents$/);
  expect((await request.get("/api/v1/meta")).status()).toBe(401);
  expect((await request.get("/api/v1/colleges/government-medical-college-nagpur-440003/residents")).status()).toBe(401);
});
