import { expect, it } from "vitest";
import type { OptionRow } from "@/features/decide/service";
import type { SeatList } from "@/features/decide/types";
import { optionsCsv } from "./csv";

const list = (kind: SeatList["kind"]): SeatList => ({ key: `k-${kind}`, name: `MCC 2026 R2 ${kind}`, url: `https://mcc.example/${kind}.pdf`, year: 2026, round: "R2", kind, publishedAt: "2026-11-13", seats: 1 });
const row = {
  college: { name: 'A "Quoted" College', state: null },
  course: { degree: "DNB", name: "Family Medicine" },
  quota: "DNB Quota",
  reach: "closed-before",
  reachProvisional: false,
  latest: { closing: 20132, round: "R1", category: "Open", provisional: true },
  byYear: { 2025: null, 2024: null },
  terms: { fee: { text: "=1+1", source: { name: "MCC profile", url: null } } },
  seatsBy: { clear: 3, virtual: null, new: 0 },
  seatsBelow: [{ kind: "clear", on: [{ category: "OBC", reach: "no-data" }] }],
} as unknown as OptionRow;

it("one seats column per list (never added) and the seat category note, quoted text, formulas defused, — for missing, BOM and sources", () => {
  const csv = optionsCsv([row], { lists: [list("clear"), list("virtual"), list("new")], includeLatest: true, notes: ["History, not a prediction."], sources: [{ name: "Result", url: null }] });
  expect(csv.startsWith("\uFEFF")).toBe(true);
  const [head, line, blank, ...rest] = csv.slice(1).split("\r\n");
  expect(head).toContain('"2026 R2 clear vacancy seats","2026 R2 virtual vacancy seats","2026 R2 newly added seats","Seat category note"');
  expect(line).toBe(
    ['1', '"A ""Quoted"" College"', "—", '"DNB Family Medicine"', '"DNB Quota"', '"Closed before your rank"', "3", "—", "0",
      '"In the clear vacancy list, your seat categories here have only OBC seats; on OBC seats alone: No allotment on OBC seats in 2024, 2025 or 2026 R1."',
      "20132", '"R1 (provisional)"', '"Open"', "—", "—", "—", "—", "—", "—", `"'=1+1"`, '"MCC profile"', "—", "—"].join(","),
  );
  expect(blank).toBe("");
  expect(rest.slice(0, 4)).toEqual(['"History, not a prediction."', "", '"Source","Link","Note"', '"Result",—,—']);
});
