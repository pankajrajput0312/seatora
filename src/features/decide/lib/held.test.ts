import { describe, expect, it } from "vitest";
import { keepProfileParams, profileFromParams, profileInput, profileSchema, profileToParams, upgradeCourses, type Profile } from "../profile";
import { heldFromParam, heldParam } from "./held";

const SEAT = "GRANTGOVERNMENTMEDICALCOLLEGEMUM#400008~MD~PHARMACOLOGY~All India";
const base: Profile = { rank: 31000, category: "EWS", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
const courses = ["MD~PHARMACOLOGY", "MD~GENERALMEDICINE", "MD~RADIODIAGNOSIS", "MS~GENERALSURGERY", "DNB~GENERALMEDICINE"].map((k) => ({ degree: k.split("~")[0], specialty: k.split("~")[1] }));

describe("I already hold a seat (lib/held.ts, profile `held`)", () => {
  it("the held param round-trips through the address; a bad one is dropped, the profile kept", () => {
    const p = { ...base, held: { id: SEAT, round: "R1" as const } };
    const q = profileToParams(p);
    expect(q.get("held")).toBe(`R1~${SEAT}`);
    expect(profileFromParams(q)?.held).toEqual(p.held);
    expect(keepProfileParams(q).get("held")).toBe(`R1~${SEAT}`);
    expect(heldFromParam(heldParam(p.held))).toEqual(p.held);
    const bad = new URLSearchParams("rank=31000&cat=EWS&held=R9~x");
    expect(profileFromParams(bad)).toMatchObject({ rank: 31000 });
    expect(profileFromParams(bad)?.held).toBeUndefined();
    expect(profileSchema.safeParse(profileInput(bad)).success).toBe(false); // the strict API refuses it
    expect(profileToParams(base).has("held")).toBe(false);
  });
  it("Upgrades only: the courses she ranks above her seat's, by her order", () => {
    const order = [["RADIODIAGNOSIS"], ["MD~GENERALMEDICINE", "MS~GENERALSURGERY"], ["MD~PHARMACOLOGY"]];
    expect(upgradeCourses({ ...base, order }, { id: SEAT }, courses)).toEqual(["MD~GENERALMEDICINE", "MD~RADIODIAGNOSIS", "MS~GENERALSURGERY"]);
    // No order: every course equal, none beats it.
    expect(upgradeCourses(base, { id: SEAT }, courses)).toEqual([]);
    // Her seat's course first: none.
    expect(upgradeCourses({ ...base, order: [["PHARMACOLOGY"], ["GENERALMEDICINE"]] }, { id: SEAT }, courses)).toEqual([]);
    // A seat in a course outside her profile: every course of hers beats it.
    expect(upgradeCourses({ ...base, specialties: ["GENERALMEDICINE"] }, { id: SEAT }, courses)).toEqual(["MD~GENERALMEDICINE", "DNB~GENERALMEDICINE"]);
  });
});
