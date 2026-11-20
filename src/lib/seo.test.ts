import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { landingWords } from "@/features/exams/landing/words";
import { faqLd, JsonLd, pageWords } from "./seo";

it("each public page's title fits ~60 characters with the layout's \" · Seatora\" (the home page's on its own), each description 155", () => {
  for (const [path, w] of [...Object.entries(pageWords), ...Object.entries(landingWords)]) {
    expect(w.title.length + (path === "/" ? 0 : " · Seatora".length), w.title).toBeLessThanOrEqual(60);
    expect(w.description.length, w.description).toBeLessThanOrEqual(155);
  }
});

it("JSON-LD can't close its script, and FAQPage keeps only answers with words", () => {
  const html = renderToStaticMarkup(createElement(JsonLd, { data: faqLd([{ q: "a</script><b>", text: "x" }, { q: "no text", text: null }]) }));
  expect(html).not.toContain("</script><b>");
  const ld = JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, ""));
  expect(ld).toMatchObject({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ name: "a</script><b>", acceptedAnswer: { text: "x" } }] });
  expect(ld.mainEntity).toHaveLength(1);
});
