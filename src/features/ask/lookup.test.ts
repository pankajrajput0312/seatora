import { expect, it } from "vitest";
import { findColleges, resolveCourses } from "./lookup";

const courses = [
  { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
  { degree: "DNB", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "dnb-anaesthesiology" },
  { degree: "DNB", specialty: "FAMILYMEDICINE", name: "Family Medicine", slug: "dnb-family-medicine" },
  { degree: "MD", specialty: "GENERALMEDICINE", name: "General Medicine", slug: "md-general-medicine" },
  { degree: "NBEMS Diploma", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "nbems-diploma-anaesthesiology" },
];
const degrees = ["MD", "DNB", "NBEMS Diploma"];

it("resolves courses by degree + name, stem, code or slug; unknown words are not guessed", () => {
  expect(resolveCourses(["DNB Anaesthesia"], courses, degrees).pairs).toEqual(["DNB~ANAESTHESIOLOGY"]);
  expect(resolveCourses(["anaesthesiology"], courses, degrees).pairs).toEqual(["MD~ANAESTHESIOLOGY", "DNB~ANAESTHESIOLOGY", "NBEMS Diploma~ANAESTHESIOLOGY"]);
  expect(resolveCourses(["FAMILYMEDICINE", "dnb-family-medicine"], courses, degrees).pairs).toEqual(["DNB~FAMILYMEDICINE"]);
  expect(resolveCourses(["NBEMS Diploma Anaesthesiology"], courses, degrees).pairs).toEqual(["NBEMS Diploma~ANAESTHESIOLOGY"]);
  expect(resolveCourses(["Medicine", "Radiology"], courses, degrees).unknown).toEqual(["Medicine", "Radiology"]);
});

const colleges = [
  { slug: "seth-gordhandas-sunderdas-medical-college-400012", name: "Seth Gordhandas Sunderdas Medical College", state: "Maharashtra" },
  { slug: "kokilaben-dhirubhai-ambani-hospital-400710", name: "Kokilaben Dhirubhai Ambani Hospital", state: "Maharashtra" },
  { slug: "kokilaben-dhirubhai-ambani-hospital-and-medical-research-institute-400053", name: "Kokilaben Dhirubhai Ambani Hospital and Medical Research Institute", state: "Maharashtra" },
  { slug: "government-medical-college-nagpur-440003", name: "Government Medical College Nagpur", state: "Maharashtra" },
  { slug: "govt-seth-govind-das-victoria-district-hospital-482002", name: "Govt Seth Govind Das Victoria District Hospital", state: "Madhya Pradesh" },
];

it("finds colleges by slug, words, initials and short forms", () => {
  expect(findColleges("Seth GS", colleges).map((c) => c.slug)).toEqual(["seth-gordhandas-sunderdas-medical-college-400012"]);
  expect(findColleges("kokilaben", colleges)).toHaveLength(2);
  expect(findColleges("kokilaben-dhirubhai-ambani-hospital-400710", colleges)).toHaveLength(1);
  expect(findColleges("GMC Nagpur", colleges).map((c) => c.name)).toEqual(["Government Medical College Nagpur"]);
  expect(findColleges("Nagpur GMC", colleges).map((c) => c.name)).toEqual(["Government Medical College Nagpur"]);
  expect(findColleges("Seth GD", colleges).map((c) => c.slug)).toEqual(["govt-seth-govind-das-victoria-district-hospital-482002"]);
  expect(findColleges("AIIMS Delhi", colleges)).toEqual([]);
});
