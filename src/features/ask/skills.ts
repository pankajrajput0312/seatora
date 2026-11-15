import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Skills, like Claude Code's: one markdown file each in ./skills with front-matter (name, description = when to use).
// The system prompt lists names and descriptions only; the model loads a body with the load_skill tool when it needs it.
// Read from disk once per process (next.config.ts traces the folder into the route's bundle).

export type Skill = { name: string; description: string; body: string };

const NAME = /^[a-z0-9-]{2,40}$/;

/** One skill file: `---\nname: x\ndescription: y\n---\nbody`. Throws on a malformed file (a build-time mistake, caught by the tests). */
export function parseSkill(text: string, file = "skill"): Skill {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: missing front-matter`);
  const meta = Object.fromEntries(
    m[1].split(/\r?\n/).flatMap((line) => {
      const i = line.indexOf(":");
      return i > 0 ? [[line.slice(0, i).trim(), line.slice(i + 1).trim()]] : [];
    }),
  );
  const { name, description } = meta;
  if (!name || !NAME.test(name)) throw new Error(`${file}: bad or missing name`);
  if (!description) throw new Error(`${file}: missing description`);
  const body = m[2].trim();
  if (!body) throw new Error(`${file}: empty body`);
  return { name, description, body };
}

export const SKILLS_DIR = path.join(process.cwd(), "src/features/ask/skills");

let cached: Skill[] | null = null;
/** Every skill, by file name order. */
export function loadSkills(dir = SKILLS_DIR): Skill[] {
  if (cached && dir === SKILLS_DIR) return cached;
  const skills = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseSkill(readFileSync(path.join(dir, f), "utf8"), f));
  if (new Set(skills.map((s) => s.name)).size !== skills.length) throw new Error("duplicate skill name");
  if (dir === SKILLS_DIR) cached = skills;
  return skills;
}

export const skillIndex = (skills: Skill[]) => skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
