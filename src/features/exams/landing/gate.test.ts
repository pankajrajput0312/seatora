import { beforeEach, expect, it, vi } from "vitest";

const { staffUser } = vi.hoisted(() => ({ staffUser: vi.fn() }));
vi.mock("@/features/auth/lib/session", () => ({ staffUser }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

import sitemap from "@/app/sitemap";
import { examKeys, exams } from "../registry";
import { landingGate, landingMetadata } from "./gate";

const staffOnly = examKeys.filter((k) => !exams[k].public);
const as = (who: "staff" | "member" | "anonymous") => staffUser.mockResolvedValue(who === "staff" ? { id: "u", role: "OWNER" } : null);

beforeEach(() => {
  staffUser.mockReset();
});

it("NEET PG is the only public exam today", () => {
  expect(examKeys.filter((k) => exams[k].public)).toEqual(["neet-pg"]);
  expect(staffOnly).toEqual(["neet-ss", "neet-mds", "ini-cet"]);
});

it("NEET PG's page opens for everyone, without reading the account (so it stays static), and is indexable", async () => {
  await expect(landingGate("neet-pg")).resolves.toBeUndefined();
  const m = await landingMetadata("neet-pg");
  expect(m.robots).toBeUndefined();
  expect(m.alternates?.canonical).toBe("/neet-pg");
  expect(staffUser).not.toHaveBeenCalled();
});

it("a staff-only exam's page is a 404 for members and anonymous visitors, its <head> the site's default (nothing of the exam)", async () => {
  for (const who of ["member", "anonymous"] as const) {
    as(who);
    for (const k of staffOnly) {
      await expect(landingGate(k)).rejects.toThrow("404");
      expect(await landingMetadata(k)).toEqual({});
    }
  }
});

it("an account read that fails is a 404, never the page", async () => {
  staffUser.mockRejectedValue(new Error("db down"));
  for (const k of staffOnly) await expect(landingGate(k)).rejects.toThrow("404");
});

it("staff see a staff-only exam's page, noindex", async () => {
  as("staff");
  for (const k of staffOnly) {
    await expect(landingGate(k)).resolves.toBeUndefined();
    expect((await landingMetadata(k)).robots).toEqual({ index: false, follow: false });
  }
});

it("the sitemap lists /neet-pg and no staff-only exam's page", async () => {
  const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
  expect(urls).toContain("/neet-pg");
  for (const k of staffOnly) expect(urls).not.toContain(`/${k}`);
});
