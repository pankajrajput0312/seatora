import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, rgbOf, tintOf } from "./contrast";

// The inside app's palette (globals.css, the .app block) meets WCAG AA: every text colour 4.5:1 on white, on the page and
// on its own 10% tint; form field borders 3:1 on white (1.4.11).
const css = readFileSync("src/app/globals.css", "utf8");
const block = css.slice(css.indexOf("  .app {"), css.indexOf("  .app h1, .app h2"));
const tokens = Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const white = [255, 255, 255];
const text = ["foreground", "muted-foreground", "sky", "sky-strong", "leaf", "sun", "ember", "flame"];

describe("app palette", () => {
  it("computes WCAG contrast", () => {
    expect(contrast([0, 0, 0], white)).toBeCloseTo(21);
    expect(contrast(white, white)).toBe(1);
  });
  it.each(text)("%s is AA text on white, the page and its own tint", (k) => {
    const c = rgbOf(tokens[k]);
    expect(contrast(c, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, rgbOf(tokens.background))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, tintOf(c))).toBeGreaterThanOrEqual(4.5);
  });
  it("form field borders are 3:1 on white", () => expect(contrast(rgbOf(tokens.input), white)).toBeGreaterThanOrEqual(3));
});
