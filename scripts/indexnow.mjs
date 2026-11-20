// Tell Bing (and other IndexNow engines; ChatGPT search reads Bing) about every public URL in our sitemaps.
// Usage: node scripts/indexnow.mjs [site] — run after a deploy that adds or changes public pages (e.g. a new round).
// The key is public/<key>.txt (IndexNow's ownership proof); no login. Google doesn't take IndexNow: use Search Console.
import { readdirSync, readFileSync } from "node:fs";
const site = process.argv[2] ?? "https://www.seatora.co.in";
const keyFile = readdirSync(new URL("../public", import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
const key = readFileSync(new URL(`../public/${keyFile}`, import.meta.url), "utf8").trim();
const locs = async (u) => [...(await (await fetch(u)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = [...new Set([...(await locs(`${site}/sitemap.xml`)), ...(await locs(`${site}/neet-pg/sitemap.xml`))])];
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: ${urls.slice(i, i + 10000).length} URLs → ${r.status} ${r.statusText}`);
}
