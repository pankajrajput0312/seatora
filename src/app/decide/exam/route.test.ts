import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const { staffUser } = vi.hoisted(() => ({ staffUser: vi.fn() }));
vi.mock("@/features/auth/lib/session", () => ({ staffUser }));

import { GET } from "./route";

const pick = (k: string, next: string) => GET(new NextRequest(`http://test/decide/exam?${new URLSearchParams({ k, next })}`, { headers: { host: "test" } }));
beforeEach(() => {
  staffUser.mockReset();
});

it("staff get the exam's cookie (Path=/decide, httpOnly) and go on to the page", async () => {
  staffUser.mockResolvedValue({ id: "u", role: "OWNER" });
  const res = await pick("neet-mds", "/decide/options?rank=500");
  expect(res.headers.get("location")).toBe("http://test/decide/options?rank=500");
  expect(res.cookies.get("seatora_exam")?.value).toBe("neet-mds");
  expect(res.headers.get("set-cookie")).toMatch(/Path=\/decide.*HttpOnly|HttpOnly.*Path=\/decide/i);
});

it("everyone else goes on to the same page with no cookie; so does an unknown exam or an off-site next", async () => {
  staffUser.mockResolvedValue(null);
  const res = await pick("neet-ss", "/decide/seats?x=1");
  expect(res.headers.get("location")).toBe("http://test/decide/seats?x=1");
  expect(res.headers.get("set-cookie")).toBeNull();
  staffUser.mockResolvedValue({ id: "u", role: "OWNER" });
  expect((await pick("nope", "/decide")).headers.get("set-cookie")).toBeNull();
  expect((await pick("neet-ss", "//evil.example/x")).headers.get("location")).toBe("http://test/decide");
});

it("an account read that fails sets nothing", async () => {
  staffUser.mockImplementation(async () => {
    throw new Error("db down");
  });
  expect((await pick("neet-ss", "/decide")).headers.get("set-cookie")).toBeNull();
});
