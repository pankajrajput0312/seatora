import { describe, expect, it } from "vitest";
import { loadSkills, parseSkill, skillIndex } from "./skills";

describe("parseSkill", () => {
  it("reads name, description and body", () => {
    expect(parseSkill("---\nname: fees-x\ndescription: When fees: use it\n---\n# Body\ntext\n")).toEqual({ name: "fees-x", description: "When fees: use it", body: "# Body\ntext" });
  });
  it("rejects a file without front-matter, name, description or body", () => {
    expect(() => parseSkill("# no front matter")).toThrow(/front-matter/);
    expect(() => parseSkill("---\ndescription: d\n---\nbody")).toThrow(/name/);
    expect(() => parseSkill("---\nname: Bad Name\ndescription: d\n---\nbody")).toThrow(/name/);
    expect(() => parseSkill("---\nname: ok\n---\nbody")).toThrow(/description/);
    expect(() => parseSkill("---\nname: ok\ndescription: d\n---\n  ")).toThrow(/empty/);
  });
});

describe("the shipped skills", () => {
  const skills = loadSkills();
  it("all parse, with unique names, and include the required ones", () => {
    expect(skills.map((s) => s.name).sort()).toEqual(
      ["choice-filling-best-practices", "choice-list-builder", "choice-list-strategy", "counselling-basics", "dnb-vs-md", "fees-stipend-bond", "reading-closing-ranks", "residents", "seatora-navigation"],
    );
  });
  it("the index lists names and descriptions only, never bodies", () => {
    const idx = skillIndex(skills);
    for (const s of skills) {
      expect(idx).toContain(`- ${s.name}: ${s.description}`);
      expect(idx).not.toContain(s.body.slice(0, 60));
    }
  });
  it("keep the NBEMS figures the data uses", () => {
    const fees = skills.find((s) => s.name === "fees-stipend-bond")!.body;
    expect(fees).toContain("₹1,25,000");
    expect(fees).toMatch(/₹43,000 \/ ₹45,000 \/ ₹47,000/);
    expect(skills.find((s) => s.name === "residents")!.body).toMatch(/Never state, guess or infer/);
  });
});
