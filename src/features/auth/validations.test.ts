import { expect, it } from "vitest";
import { changePasswordSchema } from "./validations";

it("change password: needs the current one, 8-128 new characters and a matching confirmation", () => {
  const msg = (v: object) => changePasswordSchema.safeParse(v).error?.issues.map((i) => `${i.path}: ${i.message}`);
  expect(msg({ current: "old-password", password: "new-password", confirm: "new-password" })).toBeUndefined();
  expect(msg({ current: "", password: "new-password", confirm: "new-password" })).toEqual(["current: Enter your current password"]);
  expect(msg({ current: "x", password: "short", confirm: "short" })).toEqual(["password: Use at least 8 characters"]);
  expect(msg({ current: "x", password: "a".repeat(129), confirm: "a".repeat(129) })).toEqual(["password: Use at most 128 characters"]);
  expect(msg({ current: "x", password: "a".repeat(128), confirm: "a".repeat(128) })).toBeUndefined();
  expect(msg({ current: "x", password: "new-password", confirm: "new-passwort" })).toEqual(["confirm: The new passwords don't match"]);
});
