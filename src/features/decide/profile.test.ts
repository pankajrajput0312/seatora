import { expect, it } from "vitest";
import { profileFromParams, profileToParams, type Profile } from "./profile";

const her: Profile = {
  rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [],
  quotas: ["All India", "DNB Quota"], states: [], maxFeeLakh: 5, maxBondYears: null,
};

it("round-trips through URL params and keeps unrelated params", () => {
  const p = profileToParams(her, new URLSearchParams("reach=within-10"));
  expect(p.get("reach")).toBe("within-10");
  expect(profileFromParams(p)).toEqual(her);
});

it("returns null without a valid rank", () => {
  expect(profileFromParams(new URLSearchParams("cat=OBC"))).toBeNull();
  expect(profileFromParams(new URLSearchParams("rank=abc"))).toBeNull();
});
