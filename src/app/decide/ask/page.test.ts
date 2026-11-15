import { beforeEach, expect, it, vi } from "vitest";

// Owner gating of the Ask pages: anyone but the enabled owner gets notFound(), and a report opens only for its account.
const m = vi.hoisted(() => ({ user: null as null | { id: string }, report: vi.fn() }));
vi.mock("@/features/ask/access", () => ({ askUser: async () => m.user }));
vi.mock("@/features/ask/reports", () => ({ getReport: m.report }));

const { default: AskPage } = await import("./page");
const { default: ReportPage } = await import("./report/[id]/page");

const is404 = (e: unknown) => String((e as { digest?: string })?.digest).startsWith("NEXT_HTTP_ERROR_FALLBACK;404");

beforeEach(() => {
  m.user = null;
  m.report.mockReset().mockResolvedValue(null);
});

it("Ask is not found for a non-owner (or with ASK_ENABLED off)", async () => {
  await expect(AskPage({ searchParams: Promise.resolve({}) })).rejects.toSatisfy(is404);
});

it("a report is not found for a non-owner, or for another account's report", async () => {
  await expect(ReportPage({ params: Promise.resolve({ id: "abcdefghijkl" }) })).rejects.toSatisfy(is404);
  expect(m.report).not.toHaveBeenCalled();
  m.user = { id: "owner1" };
  await expect(ReportPage({ params: Promise.resolve({ id: "abcdefghijkl" }) })).rejects.toSatisfy(is404);
  expect(m.report).toHaveBeenCalledWith("abcdefghijkl", "owner1");
});
