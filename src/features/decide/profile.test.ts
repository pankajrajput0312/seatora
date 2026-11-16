import { describe, expect, it } from "vitest";
import {
  coursesFromPicks, feeChoices, keepProfileParams, pairChoices, picksOf, profileCourseFilter, profileFromParams, profileHasCourse, profileInput, profileQuotas,
  profileSchema, profileToParams, profileWithFilters, toURLSearchParams, type Profile,
} from "./profile";

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

it("no quota ticked means the open quotas only; pages read a bad pwd as not PwD", () => {
  expect(profileQuotas({ quotas: [] })).toEqual(["All India", "DNB Quota", "Deemed/Paid Seats"]);
  expect(profileQuotas({ quotas: ["Non-Resident Indian"] })).toEqual(["Non-Resident Indian"]);
  expect(profileFromParams(new URLSearchParams("rank=1&pwd=true"))?.pwd).toBe(true);
  expect(profileFromParams(new URLSearchParams("rank=1&pwd=maybe"))?.pwd).toBe(false);
});

it("offers her fee cap even when it isn't a standard choice", () => {
  expect(feeChoices(50)).toContain(50);
  expect(feeChoices(7)).toEqual([2, 5, 7, 10, 20, 30, 50]);
});

// Her real case: Anaesthesiology in every degree, Family Medicine only as DNB (MD and NBEMS Diploma Family Medicine exist).
const courses = [
  ...["Diploma", "DNB", "MD", "NBEMS Diploma"].map((degree) => ({ degree, specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology" })),
  ...["DNB", "MD", "NBEMS Diploma"].map((degree) => ({ degree, specialty: "FAMILYMEDICINE", name: "Family Medicine" })),
];
const pairs = ["Diploma~ANAESTHESIOLOGY", "DNB~ANAESTHESIOLOGY", "MD~ANAESTHESIOLOGY", "NBEMS Diploma~ANAESTHESIOLOGY", "DNB~FAMILYMEDICINE"];
const withPairs: Profile = { ...her, pairs };

it("exact courses: c params (repeated or comma-joined) round-trip, and links carry them", () => {
  const p = profileToParams(withPairs);
  expect(p.get("c")).toBe(pairs.join(","));
  expect(profileFromParams(p)).toEqual(withPairs);
  const repeated = toURLSearchParams({ rank: "42284", cat: "OBC", c: ["DNB~FAMILYMEDICINE", "MD~ANAESTHESIOLOGY"] });
  expect(profileFromParams(repeated)?.pairs).toEqual(["DNB~FAMILYMEDICINE", "MD~ANAESTHESIOLOGY"]);
  expect(keepProfileParams(repeated).get("c")).toBe("DNB~FAMILYMEDICINE,MD~ANAESTHESIOLOGY");
});

it("back-compat: old URLs and saved profiles have no pairs and match specialties x degrees as before", () => {
  const old = profileFromParams(new URLSearchParams("rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE&deg=DNB"))!;
  expect(old).not.toHaveProperty("pairs");
  expect(profileToParams(old).has("c")).toBe(false);
  const saved = { rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY"], degrees: [], quotas: [], states: [], maxFeeLakh: 5, maxBondYears: null };
  expect(profileSchema.safeParse(saved).success).toBe(true); // a localStorage profile from before pairs
  expect(profileHasCourse(old, { degree: "DNB", specialty: "FAMILYMEDICINE" })).toBe(true);
  expect(profileHasCourse(old, { degree: "MD", specialty: "FAMILYMEDICINE" })).toBe(false);
  expect(profileHasCourse({ specialties: [], degrees: [] }, { degree: "MS", specialty: "ORTHOPAEDICS" })).toBe(true);
  expect(profileCourseFilter(old)).toEqual({ specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["DNB"] });
  expect(profileCourseFilter({ specialties: [], degrees: [], pairs: [] })).toEqual({ specialties: undefined, degrees: undefined });
});

it("pairs replace specialties x degrees in the matcher and the SQL filter", () => {
  expect(profileHasCourse(withPairs, { degree: "DNB", specialty: "FAMILYMEDICINE" })).toBe(true);
  expect(profileHasCourse(withPairs, { degree: "MD", specialty: "FAMILYMEDICINE" })).toBe(false);
  expect(profileHasCourse(withPairs, { degree: "NBEMS Diploma", specialty: "FAMILYMEDICINE" })).toBe(false);
  expect(profileHasCourse(withPairs, { degree: "NBEMS Diploma", specialty: "ANAESTHESIOLOGY" })).toBe(true);
  expect(profileCourseFilter(withPairs)).toEqual({ pairs });
});

it("a malformed pair is a 400 for the API but only dropped on pages", () => {
  const p = new URLSearchParams("rank=1&c=DNB~FAMILYMEDICINE,FAMILYMEDICINE");
  expect(profileSchema.safeParse(profileInput(p)).success).toBe(false);
  expect(profileFromParams(p)?.pairs).toEqual(["DNB~FAMILYMEDICINE"]);
  expect(profileFromParams(new URLSearchParams("rank=1&c=bad"))).not.toHaveProperty("pairs");
});

it("dialog ticks save in the old form when it can say it, else as pairs, and read back the same", () => {
  // Every degree of each ticked specialty: specialties only, exactly the old profile.
  expect(coursesFromPicks({ ANAESTHESIOLOGY: ["Diploma", "DNB", "MD", "NBEMS Diploma"], FAMILYMEDICINE: ["DNB", "MD", "NBEMS Diploma"] }, [], courses))
    .toEqual({ specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [] });
  // One set of degrees for every specialty: specialties x degrees.
  expect(coursesFromPicks({ ANAESTHESIOLOGY: ["DNB"], FAMILYMEDICINE: ["DNB"] }, [], courses)).toEqual({ specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["DNB"] });
  // Hers: only expressible as pairs.
  const picks = picksOf(withPairs, courses);
  expect(picks).toEqual({ ANAESTHESIOLOGY: ["Diploma", "DNB", "MD", "NBEMS Diploma"], FAMILYMEDICINE: ["DNB"] });
  expect(coursesFromPicks(picks, [], courses)).toEqual({ specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], pairs });
  // No specialty ticked: every course of the global degrees. Specialties ticked with no degree at all: no course, which
  // a profile can't say (empty = all), so null and the dialog asks for a degree instead of saving "all courses".
  expect(coursesFromPicks({}, ["DNB"], courses)).toEqual({ specialties: [], degrees: ["DNB"] });
  expect(coursesFromPicks({ ANAESTHESIOLOGY: [] }, [], courses)).toBeNull();
  expect(coursesFromPicks({ ANAESTHESIOLOGY: [], FAMILYMEDICINE: [] }, ["DNB"], courses)).toBeNull();
  // One specialty with no degree is left out, as its group says.
  expect(coursesFromPicks({ ANAESTHESIOLOGY: [], FAMILYMEDICINE: ["DNB"] }, [], courses)).toEqual({ specialties: ["FAMILYMEDICINE"], degrees: ["DNB"] });
  // An old specialties x degrees profile opens with those degrees ticked and saves back unchanged, also when its degrees
  // are every degree its specialties offer (her old profile).
  const old = { specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["MD", "DNB"] };
  expect(coursesFromPicks(picksOf(old, courses), old.degrees, courses)).toEqual(old);
  const every = { specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["MD", "DNB", "NBEMS Diploma", "Diploma"] };
  expect(coursesFromPicks(picksOf(every, courses), every.degrees, courses)).toEqual(every);
  expect(pairChoices(courses).slice(0, 2)).toEqual([{ value: "Diploma~ANAESTHESIOLOGY", label: "Diploma Anaesthesiology" }, { value: "DNB~ANAESTHESIOLOGY", label: "DNB Anaesthesiology" }]);
});

describe("profileWithFilters (Save as my defaults)", () => {
  const base: Profile = { rank: 5000, category: "Open", pwd: false, specialties: ["PAEDIATRICS"], degrees: ["MD"], quotas: [], states: ["Delhi"], maxFeeLakh: 10, maxBondYears: null };
  const all = new Set(["sp", "deg", "quota", "st", "maxfee", "bondyrs", "ctype"]);
  it("takes the sheet's states, quotas, courses and caps into her profile", () => {
    const q = new URLSearchParams("st=Uttar+Pradesh&st=Madhya+Pradesh&quota=All+India&sp=PAEDIATRICS&sp=PSYCHIATRY&deg=MD&maxfee=5&bondyrs=0&ctype=govt");
    expect(profileWithFilters(base, q, all)).toEqual({ ...base, states: ["Uttar Pradesh", "Madhya Pradesh"], quotas: ["All India"], specialties: ["PAEDIATRICS", "PSYCHIATRY"], maxFeeLakh: 5, maxBondYears: 0 });
  });
  it("nothing ticked is all; 'any' lifts a cap; '' (Your cap) keeps hers", () => {
    const q = new URLSearchParams("maxfee=any&bondyrs=");
    const p = profileWithFilters({ ...base, maxBondYears: 2 }, q, all);
    expect(p.states).toEqual([]);
    expect(p.maxFeeLakh).toBeNull();
    expect(p.maxBondYears).toBe(2);
  });
  it("leaves a field the form does not have as it is, and never adds a profile field (college type)", () => {
    const p = profileWithFilters(base, new URLSearchParams("ctype=govt"), new Set(["ctype"]));
    expect(p).toEqual(base);
  });
  it("exact courses replace specialty x degree; none ticked drops them", () => {
    expect(profileWithFilters(base, new URLSearchParams("c=DNB~FAMILYMEDICINE"), new Set(["c"])).pairs).toEqual(["DNB~FAMILYMEDICINE"]);
    expect("pairs" in profileWithFilters({ ...base, pairs: ["MD~PAEDIATRICS"] }, new URLSearchParams(), new Set(["c"]))).toBe(false);
  });
});
