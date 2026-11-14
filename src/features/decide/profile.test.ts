import { expect, it } from "vitest";
import { feeChoices, keepProfileParams, profileFromParams, profileToParams, toURLSearchParams, type Profile } from "./profile";

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

it("keeps the profile when one optional param is bad, reads repeated params, and strips commas from rank", () => {
  const p = profileFromParams(new URLSearchParams("rank=42,284&cat=OBC&fee=abc&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE"));
  expect(p).toMatchObject({ rank: 42284, category: "OBC", maxFeeLakh: null, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"] });
});

it("keeps every value of a repeated key from Next's searchParams (GET form with two boxes ticked)", () => {
  const p = toURLSearchParams({ rank: "42284", cat: "OBC", sp: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], st: ["Bihar", "Kerala"], q: undefined });
  expect(profileFromParams(p)).toMatchObject({ specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], states: ["Bihar", "Kerala"] });
  // links copy them comma-joined, which reads back the same
  const kept = keepProfileParams(p);
  expect(kept.toString()).toBe("rank=42284&cat=OBC&sp=ANAESTHESIOLOGY%2CFAMILYMEDICINE&st=Bihar%2CKerala");
  expect(profileFromParams(kept)).toEqual(profileFromParams(p));
});

it("offers her fee cap even when it isn't a standard choice", () => {
  expect(feeChoices(50)).toContain(50);
  expect(feeChoices(7)).toEqual([2, 5, 7, 10, 20, 30, 50]);
});
