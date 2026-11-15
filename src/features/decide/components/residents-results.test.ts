import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { decideLinks } from "../lib/links";
import { profileFromParams } from "../profile";
import type { ResidentRow } from "../residents-search";
import { residentsFilters, ResidentsCards, ResidentsInfo, ResidentsSources, ResidentsTable } from "./residents-results";

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
  it("table: caption, column and row headers, Hide, the college's Residents tab; never a category", () => {
    const html = renderToStaticMarkup(createElement(ResidentsTable, { rows: [row(), row({ id: "r2", rank: null, rankBasis: null, quota: null, round: null })], L, hide, caption: "Residents, page 1" }));
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(9);
    expect(html.match(/scope="row"/g)).toHaveLength(2);
    expect(html).toContain("/decide/institutes/some-college?rank=40000&amp;cat=Open&amp;tab=residents");
    expect(html).toContain("AIR 41,234");
    expect(html).toContain(" · 2025");
    expect(html).toContain('aria-label="Hide Test Resident A"');
    expect(html).not.toMatch(/categor/i);
  });

  it("cards: one list item per resident with its hide button", () => {
    const html = renderToStaticMarkup(createElement(ResidentsCards, { rows: [row()], L, hide }));
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html).toContain("All India, R2");
  });

  it("info and sources: rank years from the rows, each document once", () => {
    const y2024 = row({ id: "r3", year: 2024, rankBasis: "nbems/2024/published_result.pdf" });
    expect(renderToStaticMarkup(createElement(ResidentsInfo, { rows: [row(), y2024, row({ id: "r4", year: 2023, rank: null, rankBasis: null })] }))).toContain("on this page: 2024, 2025");
    const listed = { key: "mcc/2025/up_to_round_3.pdf", name: "MCC admitted candidates list (up to Round 3)", url: "https://mcc.nic.in/x.pdf", year: 2025 };
    const src = renderToStaticMarkup(createElement(ResidentsSources, { rows: [row(), row({ id: "r2" })], sources: [listed] }));
    expect(src.match(/<li/g)).toHaveLength(2); // the admitted list (linked), then the NBEMS result named from the row
    expect(src).toContain('href="https://mcc.nic.in/x.pdf"');
    expect(src.indexOf("MCC admitted")).toBeLessThan(src.indexOf("NBEMS NEET PG 2025 result"));
    // An NBEMS result in DataSource: its name and link, as NEET PG of its year.
    const nbems = { key: "nbems/2024/published_result.pdf", name: "NBEMS NEET PG 2024 result (23-08-2024)", url: "https://natboard.edu.in/x.pdf", year: 2024 };
    const two = renderToStaticMarkup(createElement(ResidentsSources, { rows: [y2024], sources: [nbems] }));
    expect(two).toContain('href="https://natboard.edu.in/x.pdf"');
    expect(two).toContain("NEET PG 2024");
  });
});
