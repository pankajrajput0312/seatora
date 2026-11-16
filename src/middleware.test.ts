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
