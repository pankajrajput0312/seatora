import { expect, it } from "vitest";
import { rounds } from "@/features/decide/types";
import { courseSlug, coursePath, cutoffPath, cutoffWords, roundsOf } from "./cutoff";

it("one page per result round, newest first, provisional while any of its sources is", () => {
  const src = [
    { year: 2025, round: "R3", provisional: false },
    { year: 2026, round: "R1", provisional: false },
    { year: 2026, round: "R2", provisional: true },
    { year: 2026, round: "R2", provisional: false },
    { year: 2025, round: "stray", provisional: false },
  ] as const;
  expect(roundsOf([...src]).map((r) => [cutoffPath(r), r.provisional])).toEqual([
    ["/neet-pg/round-2-cutoff-2026", true],
    ["/neet-pg/round-1-cutoff-2026", false],
    ["/neet-pg/stray-round-cutoff-2025", false],
    ["/neet-pg/round-3-cutoff-2025", false],
  ]);
});

it("every round's words fit Google's title (with \" · Seatora\") and description lengths, and say provisional only when it is", () => {
  for (const round of rounds)
    for (const provisional of [true, false]) {
      const w = cutoffWords({ year: 2026, round, provisional });
      expect(w.title.length, w.title).toBeLessThanOrEqual(50);
      expect(w.description.length, w.description).toBeLessThanOrEqual(155);
      expect(w.h1.includes("(Provisional)")).toBe(provisional);
    }
  expect(cutoffWords({ year: 2026, round: "R2", provisional: true })).toMatchObject({
    title: "NEET PG 2026 Round 2 Cutoff: Last Rank by Branch",
    h1: "NEET PG 2026 Round 2 Cutoff (Provisional): Last Rank by Branch",
  });
});

it("a course's page is its own slug, else degree and name in kebab case (as the data's slugs are made)", () => {
  expect(coursePath({ slug: "md-general-medicine", degree: "MD", name: "x" })).toBe("/neet-pg/cutoff/md-general-medicine");
  expect(courseSlug({ degree: "Diploma", name: "GYNAE. and OBST." })).toBe("diploma-gynae-and-obst");
  expect(courseSlug({ slug: "", degree: "DNB", name: "Cardio Vascular and Thoracic Surgery (Direct 6 Years Course)" })).toBe("dnb-cardio-vascular-and-thoracic-surgery-direct-6-years-course");
});
