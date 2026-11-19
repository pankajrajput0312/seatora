import { beforeEach, expect, it, vi } from "vitest";

const { jar, staffUser } = vi.hoisted(() => ({ jar: new Map<string, string>(), staffUser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => jar.get(name) ?? null }) }));
vi.mock("@/features/auth/lib/session", () => ({ staffUser }));

import { activeExam } from "./active";

const as = async (cookie: string | null, staff: boolean) => {
  jar.clear();
  if (cookie != null) jar.set("x-seatora-exam", cookie);
  staffUser.mockResolvedValue(staff ? { id: "u", role: "OWNER" } : null);
  return activeExam();
};

beforeEach(() => {
  staffUser.mockReset();
});

it("everyone but staff gets NEET PG, whatever the URL's exam (the middleware's header) says", async () => {
  for (const c of [null, "neet-pg", "neet-ss", "neet-mds", "nope"]) expect(await as(c, false)).toBe("neet-pg");
});

it("staff get the exam they picked; an unknown pick is NEET PG", async () => {
  expect(await as("neet-ss", true)).toBe("neet-ss");
  expect(await as("neet-mds", true)).toBe("neet-mds");
  expect(await as("nope", true)).toBe("neet-pg");
  expect(await as(null, true)).toBe("neet-pg");
});

it("no pick, or NEET PG's: no account read", async () => {
  await as(null, false);
  await as("neet-pg", true);
  expect(staffUser).not.toHaveBeenCalled();
});

it("an account read that fails is NEET PG", async () => {
  jar.set("x-seatora-exam", "neet-ss");
  staffUser.mockRejectedValue(new Error("db down"));
  expect(await activeExam()).toBe("neet-pg");
});
