import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

it("verifies the right password, rejects the wrong one, salts every hash", async () => {
  const a = await hashPassword("correct horse battery");
  const b = await hashPassword("correct horse battery");
  expect(a).not.toBe(b);
  expect(await verifyPassword("correct horse battery", a)).toBe(true);
  expect(await verifyPassword("wrong password", a)).toBe(false);
  expect(await verifyPassword("anything", "garbage")).toBe(false);
});
