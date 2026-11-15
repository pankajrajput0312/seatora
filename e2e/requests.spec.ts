import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, freshIp, hasInvite, invited, test } from "./auth";

// "Request a feature": the in-app page (signed in, e2e/auth.ts) and the public form on /contact (signed out). Writes to the
// database: every request made here is deleted afterwards, found by its unique message.
const db = new PrismaClient();
const made: string[] = [];
const note = (where: string) => {
  const message = `E2E ${where} request ${Date.now()}-${randomBytes(3).toString("hex")}: please add a hostel column to Seats.`;
  made.push(message);
  return message;
};
test.afterAll(async () => {
  if (made.length) await db.featureRequest.deleteMany({ where: { message: { in: made } } });
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(freshIp()));

const THANKS = "Thanks — we reply within 2 working days.";
const fields = { kind: true, email: true, userId: true, page: true, status: true } as const;

test("in-app: a signed-in request goes out with the account email and shows under Your requests", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL || !hasInvite, "needs DATABASE_URL, E2E_EMAIL and E2E_PASSWORD");
  await page.goto("/decide/requests");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Request a feature");
  const form = page.locator("section[aria-label='New request'] form");
  const email = form.getByLabel("Email");
  await expect(email).toHaveValue(invited.email);
  await expect(email).toHaveAttribute("readonly", "");

  const box = form.getByLabel("Your message");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(box).toHaveAccessibleDescription(/Please write at least 10 characters\./);
  await expect(box).toBeFocused();

  const message = note("in-app");
  await form.getByLabel("Customization for me").check();
  await box.fill(message);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByRole("status")).toHaveText(THANKS);
  await expect(box).toHaveValue("");
  const row = page.locator("section[aria-labelledby=mine-h] li", { hasText: message });
  await expect(row).toContainText("Customization for me");
  await expect(row).toContainText("New");

  const user = await db.user.findUniqueOrThrow({ where: { email: invited.email }, select: { id: true } });
  expect(await db.featureRequest.findFirst({ where: { message }, select: fields })).toEqual({
    kind: "customization", email: invited.email, userId: user.id, page: "/decide/requests", status: "new",
  });
});

test("contact page: anyone can send a request without an account; the email is required", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs a database");
  await page.context().clearCookies(); // signed out
  await page.goto("/contact");
  const form = page.locator("section[aria-labelledby=request-h] form");
  const email = form.getByLabel("Email");
  const message = note("public");
  await form.getByLabel("Data correction or missing data").check();
  await form.getByLabel("Your message").fill(message);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(email).toHaveAccessibleDescription(/^Enter your email so we can reply\. We use it only to reply/); // the privacy note stays
  await expect(email).toBeFocused();

  const from = `request-${Date.now()}-${randomBytes(3).toString("hex")}@seatora.test`;
  await email.fill(from);
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByRole("status")).toHaveText(THANKS);
  await expect(form.getByLabel("Your message")).toHaveValue("");
  await expect(email).toHaveValue(from); // kept for the next one
  expect(await db.featureRequest.findFirst({ where: { message }, select: fields })).toEqual({ kind: "data", email: from, userId: null, page: "/contact", status: "new" });

  // A second send gets a new live message, so it is announced again.
  const first = await form.getByRole("status").locator("p").elementHandle();
  await form.getByLabel("Your message").fill(note("public again"));
  await form.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => first?.evaluate((el) => el.isConnected)).toBe(false);
  await expect(form.getByRole("status")).toHaveText(THANKS);
});

test("owner: a long unbroken message keeps every row's status select on screen, and sender is labelled", async ({ page }) => {
  const owners = (process.env.SEATORA_OWNER_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim());
  test.skip(!process.env.DATABASE_URL || !hasInvite || !owners.includes(invited.email.toLowerCase()), "needs the invited account in SEATORA_OWNER_EMAILS");
  const message = `${note("owner")} ${"x".repeat(400)}`;
  made.push(message);
  await db.featureRequest.create({ data: { kind: "other", message, email: "someone@seatora.test" } });
  await page.goto("/decide/requests?kind=other");
  const row = page.locator("section[aria-labelledby=all-h] li", { hasText: message.slice(0, 40) });
  await expect(row).toContainText("No account: email not verified");
  const select = row.getByLabel(/^Status: Something else from someone@seatora\.test, /);
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeInViewport(); // the page can't scroll sideways (the shell clips), so off to the right = unreachable
  const width = await page.evaluate(() => innerWidth);
  for (const box of [await row.boundingBox(), await select.boundingBox()]) expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
});
