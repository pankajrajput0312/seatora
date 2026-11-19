import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

// The device cookie (docs/FUNNEL.md): set for a browser's page request that lacks one, put on that request too; never
// for a bot, and never replaced.
const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const visit = (headers: Record<string, string>, path = "/") => middleware(new NextRequest(`http://test${path}`, { headers }));

describe("middleware: seatora_aid", () => {
  it("a browser gets a random 22-character id for a year (httpOnly, Lax); the page sees it on the same request", async () => {
    const res = await visit({ "user-agent": chrome });
    const set = res.headers.get("set-cookie") ?? "";
    const aid = res.cookies.get("seatora_aid")?.value ?? "";
    expect(aid).toMatch(/^[\w-]{22}$/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Max-Age=31536000/);
    expect(res.headers.get("x-middleware-request-cookie") ?? res.headers.get("x-middleware-override-headers")).toBeTruthy();
    expect((await visit({ "user-agent": chrome })).cookies.get("seatora_aid")?.value).not.toBe(aid);
  });

  it("skips bots and keeps an existing id", async () => {
    expect((await visit({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })).cookies.get("seatora_aid")).toBeUndefined();
    expect((await visit({})).cookies.get("seatora_aid")).toBeUndefined(); // no user agent
    expect((await visit({ "user-agent": chrome, cookie: "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA" })).cookies.get("seatora_aid")).toBeUndefined();
  });
});

describe("middleware: the URL's ?exam=", () => {
  const ua = { "user-agent": chrome };
  const header = (res: Response) => res.headers.get("x-middleware-request-x-seatora-exam");
  it("without the staff cookie: to /decide/exam with the page as asked; no exam cookie set, no exam header", async () => {
    const res = await visit({ ...ua, cookie: "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA" }, "/decide/options?rank=500&exam=neet-ss&sp=X");
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!, "http://test");
    expect(to.pathname).toBe("/decide/exam");
    expect(Object.fromEntries(to.searchParams)).toEqual({ k: "neet-ss", next: "/decide/options?rank=500&exam=neet-ss&sp=X" });
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/seatora_exam/);
    // an exam that isn't one goes there too, even with the cookie
    expect((await visit({ ...ua, cookie: "seatora_exam=neet-ss" }, "/decide?exam=nope")).status).toBe(307);
  });
  it("with it: on to the page, the exam handed over as a header; the cookie follows the URL's exam", async () => {
    const res = await visit({ ...ua, cookie: "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA; seatora_exam=neet-mds" }, "/decide/options?rank=500&exam=neet-ss");
    expect(res.headers.get("location")).toBeNull();
    expect(header(res)).toBe("neet-ss");
    expect(res.cookies.get("seatora_exam")?.value).toBe("neet-ss");
    // the same exam: no cookie written
    const same = await visit({ ...ua, cookie: "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA; seatora_exam=neet-ss" }, "/decide/seats?exam=neet-ss");
    expect([header(same), same.headers.get("set-cookie")]).toEqual(["neet-ss", null]);
  });
  it("no ?exam=: no exam header, whatever the request sent or the cookie says (NEET PG)", async () => {
    const res = await visit({ ...ua, cookie: "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA; seatora_exam=neet-ss", "x-seatora-exam": "neet-ss" }, "/decide/options?rank=500");
    expect(res.headers.get("location")).toBeNull();
    expect(header(res)).toBeNull();
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/seatora_exam/);
  });
  it("bare /decide: the staff browser's last exam (its cookie); NEET PG's or none, or anything asked: as it is", async () => {
    const aid = "seatora_aid=AAAAAAAAAAAAAAAAAAAAAA";
    const ss = await visit({ ...ua, cookie: `${aid}; seatora_exam=neet-ss` }, "/decide");
    expect(new URL(ss.headers.get("location")!).pathname + new URL(ss.headers.get("location")!).search).toBe("/decide?exam=neet-ss");
    for (const [cookie, path] of [[`${aid}; seatora_exam=neet-pg`, "/decide"], [aid, "/decide"], [`${aid}; seatora_exam=neet-ss`, "/decide?rank=500"], [`${aid}; seatora_exam=neet-ss`, "/decide/options"]])
      expect((await visit({ ...ua, cookie }, path)).headers.get("location")).toBeNull();
  });
});
