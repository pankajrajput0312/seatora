import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { decideLinks } from "../lib/links";
import { profileFromParams } from "../profile";
import type { ResidentRow } from "../residents-search";
import { residentDocs, residentsFilters, ResidentsAbout, ResidentsCards, ResidentsTable } from "./residents-results";

const courses = [
  { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
  { degree: "DNB", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "dnb-anaesthesiology" },
  { degree: "MD", specialty: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" },
];
const her = profileFromParams(new URLSearchParams("rank=40000&cat=Open&sp=ANAESTHESIOLOGY&quota=All India"));
const filters = (qs: string, p = her) => residentsFilters(new URLSearchParams(qs), p, courses);

// Synthetic rows (never real names).
const row = (o: Partial<ResidentRow> = {}): ResidentRow => ({
  id: "r1",
  name: "Test Resident A",
  year: 2025,
  list: "up to Round 3",
  sourceKey: "mcc/2025/up_to_round_3.pdf",
  quota: "All India",
  round: "R2",
  course: courses[0],
  college: { slug: "some-college", name: "Some Medical College", state: "Kerala" },
  ...o,
});
const hide = async () => ({ ok: true as const, data: null });
const L = decideLinks("rank=40000&cat=Open");

describe("residentsFilters", () => {
  it("defaults to her courses, sorted by year; her profile's quota is not the quota filter; no rank anywhere", () => {
    const { query, yours, allCourses } = filters("quota=All India");
    expect(query.course).toEqual(["md-anaesthesiology", "dnb-anaesthesiology"]);
    expect([yours?.length, allCourses]).toEqual([2, false]);
    expect(query).toMatchObject({ sort: "year", page: 1 });
    expect(query.quota).toBeUndefined();
    expect(Object.keys(filters("rankFrom=1&rankTo=9&hasRank=1&ranks=all").query).filter((k) => /rank/i.test(k))).toEqual([]);
  });

  it("course=all drops the default; rq is the quota; courses and colleges repeat; an old rank sort reads as the default", () => {
    expect(filters("course=all").query.course).toBeUndefined();
    expect(filters("course=all").allCourses).toBe(true);
    expect(filters("rq=DNB Quota").query.quota).toBe("DNB Quota");
    expect(filters("course=md-paediatrics&course=dnb-anaesthesiology").query.course).toEqual(["md-paediatrics", "dnb-anaesthesiology"]);
    expect(filters("college=a-college&college=b-college").query.college).toEqual(["a-college", "b-college"]);
    expect(filters("sort=rank").query.sort).toBe("year");
  });

  it("without a profile: every course; bad values dropped", () => {
    const { query, yours } = filters("year=1999&sort=bogus&page=x", null);
    expect(yours).toBeNull();
    expect(query).toMatchObject({ course: undefined, sort: "year", page: 1 });
    expect(query.year).toBeUndefined();
  });
});

describe("Residents views", () => {
  const types = new Map([["some-college", { value: "govt" as const, basis: "inferred: name" }]]);

  it("table: caption, column and row headers, Hide, the college's Residents tab and type; never a category", () => {
    const html = renderToStaticMarkup(createElement(ResidentsTable, { rows: [row(), row({ id: "r2", quota: null, round: null })], L, hide, caption: "Residents, page 1", types }));
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(4); // Name, College, Course, Year (no list, quota or round: owner, 15 Nov 2026)
    expect(html.match(/scope="row"/g)).toHaveLength(2);
    expect(html).toContain("/decide/institutes/some-college?rank=40000&amp;cat=Open&amp;tab=residents");
    expect(html).not.toMatch(/\bRank\b|AIR /);
    expect(html).not.toContain("Hide"); // Hide control taken out (owner, 15 Nov 2026)
    expect(html).toContain("Government");
    expect(html).not.toMatch(/categor/i);
  });

  it("cards: ResultCards, one item per resident; year and round, college link, course, chips, state and type; Hide in the header", () => {
    const html = renderToStaticMarkup(createElement(ResidentsCards, { rows: [row(), row({ id: "r2", quota: null, round: null, college: { slug: "other", name: "Other College", state: null } })], L, hide, types }));
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html.match(/<h3/g)).toHaveLength(2); // the college, a heading per card
    expect(html).toContain('href="/decide/institutes/some-college?rank=40000&amp;cat=Open&amp;tab=residents"');
    expect(html).not.toMatch(/\bRank\b|AIR /);
    for (const s of ["Test Resident A", "Year", "2025", "MD Anaesthesiology", "Kerala", "Government"]) expect(html).toContain(s);
    for (const s of ["MCC list", "All India", "R2"]) expect(html).not.toContain(s);
    expect(html.match(/Government/g)).toHaveLength(2); // the first card's badge and its (i) only: none for the other college
    expect(html).not.toContain("Hide"); // Hide control taken out (owner, 15 Nov 2026)
    expect(html).not.toMatch(/categor/i);
  });

  it("about: no rank; sources: each document once, the admitted lists first (an NBEMS result only for a row with a rankBasis, the institute's tab), keyed as the institute tab", () => {
    const about = renderToStaticMarkup(createElement(ResidentsAbout));
    expect(about).not.toMatch(/All India Rank|AIR|NBEMS/);
    expect(about).toContain("No rank");
    const listed = { key: "mcc/2025/up_to_round_3.pdf", name: "MCC admitted candidates list (up to Round 3)", url: "https://mcc.nic.in/x.pdf", year: 2025 };
    expect(residentDocs([row(), row({ id: "r2" })], [listed])).toEqual([{ key: "residents|mcc/2025/up_to_round_3.pdf", name: listed.name, url: listed.url, type: "OFFICIAL", note: "PG counselling 2025" }]);
    const y2024 = { ...row({ id: "r3", year: 2024 }), rankBasis: "nbems/2024/published_result.pdf" };
    const nbems = { key: "nbems/2024/published_result.pdf", name: "NBEMS NEET PG 2024 result (23-08-2024)", url: "https://natboard.edu.in/x.pdf", year: 2024 };
    expect(residentDocs([y2024], [nbems]).map((d) => d.name)).toEqual(["MCC admitted candidates list (up to Round 3)", nbems.name]);
  });
});
