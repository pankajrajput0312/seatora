import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const { staffUser, getCollege } = vi.hoisted(() => ({ staffUser: vi.fn(), getCollege: vi.fn() }));
vi.mock("@/features/auth/lib/session", () => ({ staffUser }));
vi.mock("@/features/decide/service", () => ({ getCollege }));

import { GET } from "./route";

const pick = (k: string, next: string) => GET(new NextRequest(`http://test/decide/exam?${new URLSearchParams({ k, next })}`, { headers: { host: "test" } }));
const to = async (k: string, next: string) => (await pick(k, next)).headers.get("location");
beforeEach(() => {
  staffUser.mockReset();
  getCollege.mockReset();
});

it("staff: the cookie (Path=/decide, httpOnly), and on to the page with ?exam= (none for NEET PG)", async () => {
  staffUser.mockResolvedValue({ id: "u", role: "OWNER" });
  const res = await pick("neet-mds", "/decide/options?rank=500&exam=neet-ss");
  expect(res.headers.get("location")).toBe("http://test/decide/options?rank=500&exam=neet-mds");
  expect(res.cookies.get("seatora_exam")?.value).toBe("neet-mds");
  expect(res.headers.get("set-cookie")).toMatch(/Path=\/decide.*HttpOnly|HttpOnly.*Path=\/decide/i);
  expect(await to("neet-pg", "/decide/seats?rank=5&exam=neet-ss")).toBe("http://test/decide/seats?rank=5");
});

it("staff switching on an institute page: that institute where the exam has it, else its institutes", async () => {
  staffUser.mockResolvedValue({ id: "u", role: "OWNER" });
  getCollege.mockResolvedValueOnce({ slug: "x" }).mockResolvedValueOnce(null);
  expect(await to("neet-ss", "/decide/institutes/x?rank=5&tab=fees")).toBe("http://test/decide/institutes/x?rank=5&tab=fees&exam=neet-ss");
  expect(await to("neet-ss", "/decide/institutes/y?rank=5&tab=fees")).toBe("http://test/decide/institutes?rank=5&exam=neet-ss");
});

it("everyone else: the page without ?exam=, and without another exam's profile params; no cookie", async () => {
  staffUser.mockResolvedValue(null);
  const res = await pick("neet-ss", "/decide/seats?rank=300&quota=All+India+%28Medical+Group%29&exam=neet-ss&tab=matrix");
  expect(res.headers.get("location")).toBe("http://test/decide/seats?tab=matrix");
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(await to("neet-pg", "/decide/seats?rank=300&exam=neet-pg")).toBe("http://test/decide/seats?rank=300");
  staffUser.mockResolvedValue({ id: "u", role: "OWNER" });
  expect((await pick("nope", "/decide?exam=nope")).headers.get("set-cookie")).toBeNull();
  expect(await to("nope", "/decide?exam=nope&rank=4")).toBe("http://test/decide?rank=4");
  expect(await to("neet-ss", "//evil.example/x")).toBe("http://test/decide?exam=neet-ss");
});

it("an account read that fails is everyone else", async () => {
  staffUser.mockImplementation(async () => {
    throw new Error("db down");
  });
  expect((await pick("neet-ss", "/decide")).headers.get("set-cookie")).toBeNull();
});

it("everyone else's made-up seatora_exam cookie is cleared (only staff are ever given one)", async () => {
  staffUser.mockResolvedValue(null);
  const req = new NextRequest(`http://test/decide/exam?${new URLSearchParams({ k: "neet-ss", next: "/decide/options" })}`, { headers: { host: "test", cookie: "seatora_exam=neet-ss" } });
  const res = await GET(req);
  expect(res.headers.get("location")).toBe("http://test/decide/options");
  expect(res.headers.get("set-cookie")).toMatch(/seatora_exam=;.*Max-Age=0/i);
});
