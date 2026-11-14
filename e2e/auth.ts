import { randomInt } from "node:crypto";
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

// The one invited account: E2E_EMAIL and E2E_PASSWORD. With the access gate on, the server under test needs E2E_EMAIL in
// SEATORA_ALLOWED_EMAILS and the same SEATORA_INVITE_CODE as the tests (sign-up only). The tests also need DATABASE_URL.
export const invited = {
  email: process.env.E2E_EMAIL ?? "",
  password: process.env.E2E_PASSWORD ?? "",
  invite: process.env.SEATORA_INVITE_CODE ?? "",
};
export const hasInvite = !!(invited.email && invited.password);

/** A fresh client IP (the app trusts x-real-ip), so each test has its own per-IP rate limits and lockout pair. */
export const freshIp = () => ({ "x-real-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });

export async function signIn(page: Page, email = invited.email, password = invited.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs the invited account up, or in when it already exists (or there's no invite code here). Ends on /decide. */
export async function signUpOrIn(page: Page) {
  if (invited.invite) {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("E2E Aspirant");
    await page.getByLabel("Email").fill(invited.email);
    await page.getByLabel("Password").fill(invited.password);
    await page.getByLabel("Invite code").fill(invited.invite);
    await page.getByRole("button", { name: "Create account" }).click();
    const alert = page.locator("form [role=alert]"); // (Next's route announcer is also role=alert)
    const onDecide = () => /\/decide/.test(page.url());
    await expect.poll(async () => onDecide() || (await alert.isVisible())).toBe(true);
    if (onDecide()) return;
  }
  await signIn(page);
  await expect(page).toHaveURL(/\/decide/);
}

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** `test` whose pages are signed in to the invited account (once per worker). Without E2E_EMAIL pages are signed out. */
export const test = base.extend<object, { signedIn: State | undefined }>({
  signedIn: [
    async ({ browser }, provide, info) => {
      if (!hasInvite) return provide(undefined);
      const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, extraHTTPHeaders: freshIp() });
      await signUpOrIn(await ctx.newPage());
      const state = await ctx.storageState();
      await ctx.close();
      await provide(state);
    },
    { scope: "worker" },
  ],
  storageState: ({ signedIn }, provide) => provide(signedIn),
});
export { expect };
