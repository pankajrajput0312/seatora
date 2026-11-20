import { beforeEach, describe, expect, it, vi } from "vitest";

const events: { name: string; meta: { p: string }; at: Date }[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    funnelEvent: {
      findFirst: vi.fn(async ({ where }: { where: { name: string; at: { gte: Date }; meta: { equals: string } } }) =>
        events.find((e) => e.name === where.name && e.at >= where.at.gte && e.meta.p === where.meta.equals) ?? null),
      create: vi.fn(async ({ data }: { data: { name: string; meta: { p: string } } }) => events.push({ ...data, at: new Date() })),
    },
  },
}));
const sent: string[] = [];
vi.mock("./cloud-api", () => ({
  sendLink: vi.fn(async (to: string) => (sent.push(to), true)),
  sendText: vi.fn(async (to: string) => (sent.push(to), true)),
  sendChoices: vi.fn(),
  toWhatsApp: (t: string) => t,
  typing: vi.fn(),
}));

describe("signupPrompt (a number with no Seatora account)", () => {
  beforeEach(() => {
    events.length = 0;
    sent.length = 0;
  });
  it("sends the sign-up link once, then stays quiet for that number", async () => {
    const { signupPrompt } = await import("./bot");
    await signupPrompt("919000000001");
    await signupPrompt("919000000001");
    await signupPrompt("919000000002");
    expect(sent).toEqual(["919000000001", "919000000002"]);
    expect(events.every((e) => !JSON.stringify(e).includes("919000000001"))).toBe(true); // only a hash is kept
  });
});
