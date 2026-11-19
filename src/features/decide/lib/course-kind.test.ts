import { describe, expect, it } from "vitest";
import { courseKind } from "./course-kind";

describe("courseKind (Seatora's grouping)", () => {
  it("basic sciences non-clinical, laboratory and public health para-clinical, patient care clinical", () => {
    expect(["BIOCHEMISTRY", "MICROBIOLOGY", "GENERALMEDICINE", "ANAESTHESIOLOGY", "COMMUNITYMEDICINE"].map(courseKind)).toEqual(["Non-clinical", "Para-clinical", "Clinical", "Clinical", "Para-clinical"]);
  });
  it("other exams' codes: super-specialties clinical, INI-CET's 6-year codes, dental subjects", () => {
    expect(["CARDIOLOGY", "VIROLOGY", "NEUROLOGY6Y", "ORALPATHOLOGY", "ORTHODONTICS"].map(courseKind)).toEqual(["Clinical", "Para-clinical", "Clinical", "Para-clinical", "Clinical"]);
  });
  it("no tag rather than a guess", () => {
    expect(courseKind("AEROSPACEMEDICINE")).toBeNull();
  });
});
