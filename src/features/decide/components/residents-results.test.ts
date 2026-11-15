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
  rank: 41234,
  rankBasis: "nbems/2025/merit_list_AIQ50.pdf",
  quota: "All India",
  round: "R2",
  course: courses[0],
  college: { slug: "some-college", name: "Some Medical College", state: "Kerala" },
  ...o,
});
const hide = async () => ({ ok: true as const, data: null });
const L = decideLinks("rank=40000&cat=Open");

describe("residentsFilters", () => {
  it("defaults to her courses and her rank ±20%; her profile's quota is not the quota filter", () => {
    const { query, yours, around } = filters("quota=All India");
    expect(query.course).toEqual(["md-anaesthesiology", "dnb-anaesthesiology"]);
    expect(yours?.length).toBe(2);
    expect(around).toEqual({ rankFrom: 32000, rankTo: 48000 });
    expect(query).toMatchObject({ rankFrom: 32000, rankTo: 48000, sort: "rank", page: 1 });
    expect(query.quota).toBeUndefined();
  });

  it("course=all and ranks=all drop the defaults; rq is the quota; typed ranks win, commas allowed, swapped when reversed", () => {
    expect(filters("course=all&ranks=all").query).toMatchObject({ course: undefined, rankFrom: undefined, rankTo: undefined });
    expect(filters("rq=DNB Quota").query.quota).toBe("DNB Quota");
    expect(filters("rankFrom=50,000&rankTo=30 000").query).toMatchObject({ rankFrom: 30000, rankTo: 50000 });
    expect(filters("ranks=all&rankTo=9000").around).toBeNull();
    expect(filters("course=md-paediatrics").query.course).toEqual(["md-paediatrics"]);
  });

  it("without a profile: every course and rank; bad values dropped", () => {
    const { query, yours } = filters("year=1999&sort=bogus&hasRank=1&page=x", null);
    expect(yours).toBeNull();
    expect(query).toMatchObject({ course: undefined, rankFrom: undefined, sort: "rank", hasRank: true, page: 1 });
    expect(query.year).toBeUndefined();
  });
});

describe("Residents views", () => {
  const types = new Map([["some-college", { value: "govt" as const, basis: "inferred: name" }]]);

  it("table: caption, column and row headers, Hide, the college's Residents tab and type; never a category", () => {
    const html = renderToStaticMarkup(createElement(ResidentsTable, { rows: [row(), row({ id: "r2", rank: null, rankBasis: null, quota: null, round: null })], L, hide, caption: "Residents, page 1", types }));
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(8);
    expect(html.match(/scope="row"/g)).toHaveLength(2);
    expect(html).toContain("/decide/institutes/some-college?rank=40000&amp;cat=Open&amp;tab=residents");
    expect(html).toContain("AIR 41,234");
    expect(html).toContain(" · 2025");
    expect(html).not.toContain("Hide"); // Hide control taken out (owner, 15 Nov 2026)
    expect(html).toContain("Government");
    expect(html).not.toMatch(/categor/i);
  });

  it("cards: ResultCards, one item per resident; rank, college link, course, chips, state and type; Hide in the header", () => {
    const html = renderToStaticMarkup(createElement(ResidentsCards, { rows: [row(), row({ id: "r2", rank: null, quota: null, round: null, college: { slug: "other", name: "Other College", state: null } })], L, hide, types }));
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html.match(/<h3/g)).toHaveLength(2); // the college, a heading per card
    expect(html).toContain('href="/decide/institutes/some-college?rank=40000&amp;cat=Open&amp;tab=residents"');
    for (const s of ["Test Resident A", "AIR 41,234", "NEET PG 2025", "MD Anaesthesiology", "2025 · R2", "MCC list: up to Round 3", "All India", "Kerala", "Government"]) expect(html).toContain(s);
    expect(html.match(/Government/g)).toHaveLength(2); // the first card's badge and its (i) only: none for the other college
    expect(html).not.toContain("Hide"); // Hide control taken out (owner, 15 Nov 2026)
    expect(html).not.toMatch(/categor/i);
  });

  it("about and sources: rank years from the rows; each document once, the admitted lists first, keyed as the institute tab", () => {
    const y2024 = row({ id: "r3", year: 2024, rankBasis: "nbems/2024/published_result.pdf" });
    expect(renderToStaticMarkup(createElement(ResidentsAbout, { rows: [row(), y2024, row({ id: "r4", year: 2023, rank: null, rankBasis: null })] }))).toContain("on this page: 2024, 2025");
    const listed = { key: "mcc/2025/up_to_round_3.pdf", name: "MCC admitted candidates list (up to Round 3)", url: "https://mcc.nic.in/x.pdf", year: 2025 };
    // The admitted list (linked), then the NBEMS result named from the row.
    expect(residentDocs([row(), row({ id: "r2" })], [listed])).toEqual([
      { key: "residents|mcc/2025/up_to_round_3.pdf", name: listed.name, url: listed.url, type: "OFFICIAL", note: "PG counselling 2025" },
      { key: "residents|nbems/2025/merit_list_AIQ50.pdf", name: "NBEMS NEET PG 2025 result", url: null, type: "OFFICIAL", note: "NEET PG 2025 rank source" },
    ]);
    const nbems = { key: "nbems/2024/published_result.pdf", name: "NBEMS NEET PG 2024 result (23-08-2024)", url: "https://natboard.edu.in/x.pdf", year: 2024 };
    expect(residentDocs([y2024], [nbems]).map((d) => d.name)).toEqual(["MCC admitted candidates list (up to Round 3)", nbems.name]);
  });
});
