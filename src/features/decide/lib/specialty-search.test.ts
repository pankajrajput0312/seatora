import { describe, expect, it } from "vitest";
import { matchesSpecialty, specialtyName } from "./specialty-search";

describe("matchesSpecialty", () => {
  const cases: [string, string][] = [
    ["Radiology", "Radio-Diagnosis"],
    ["radiol", "MD Radiodiagnosis"],
    ["Dermatology", "DERM.,VENE. and LEPROSY"],
    ["skin", "Dermatology, Venereology and Leprosy (DVL)"],
    ["DVL", "DERMATOLOGY and VENEREOLOGY and LEPROSY"],
    ["OBG", "Obstetrics and Gynaecology"],
    ["Gynae", "Obst. and Gynae"],
    ["obstetrics", "GYNAE. and OBST."],
    ["ENT", "MS Otorhinolaryngology"],
    ["chest", "Respiratory Medicine"],
    ["TB", "Respiratory Medicine"],
    ["respiratory", "T.B. and CHEST DISEASES"],
    ["Ortho", "Orthopaedics"],
    ["Medicine", "General Medicine"],
    ["Surgery", "General Surgery"],
    ["Paeds", "Paediatrics"],
    ["Psych", "Psychiatry"],
    ["Anaesthesia", "Anaesthesiology"],
    ["md path", "MD Pathology"],
  ];
  it.each(cases)("%s finds %s", (q, label) => expect(matchesSpecialty(q, label)).toBe(true));
  it("does not match unrelated names", () => {
    expect(matchesSpecialty("Radiology", "Pathology")).toBe(false);
    expect(matchesSpecialty("ENT", "Anatomy")).toBe(false);
    expect(matchesSpecialty("zzz", "General Medicine")).toBe(false);
  });
  it("matches everything on an empty query", () => expect(matchesSpecialty("  ", "Anatomy")).toBe(true));
});

describe("specialtyName", () => {
  it("title-cases ALL-CAPS names", () => {
    expect(specialtyName("T.B. and CHEST DISEASES")).toBe("T.B. and Chest Diseases");
    expect(specialtyName("IMMUNO-HAEMATOLOGY and BLOOD TRANSFUSION")).toBe("Immuno-Haematology and Blood Transfusion");
  });
  it("keeps mixed-case names and uses the canonical name by code", () => {
    expect(specialtyName("Radio-Diagnosis")).toBe("Radio-Diagnosis");
    expect(specialtyName("DERM.,VENE. and LEPROSY", "DERMATOLOGY")).toBe("Dermatology, Venereology and Leprosy (DVL)");
  });
});
