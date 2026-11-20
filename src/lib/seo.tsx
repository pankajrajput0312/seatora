// What search engines and AI answer engines read beyond the page: each public page's <head> words and the site's
// JSON-LD (schema.org, as Google documents it). Words stay true to the product: MCC counselling only, no state quota.
import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { PLANS } from "@/features/payments/plans";
import { longDate } from "@/features/plans/plans";
import { formatPaise } from "@/features/referrals/lib";

const price = formatPaise(PLANS.season_pass.amount);

/** Titles ≤ 50 characters (the layout adds " · Seatora": ~60 in all, what Google shows), descriptions ≤ 155. */
export const pageWords = {
  "/": {
    title: "Seatora: NEET PG 2026 Counselling Planner & Closing Ranks", // absolute: the brand first, no suffix
    description: siteConfig.description,
  },
  "/about": {
    title: "About Seatora, the NEET PG Counselling Planner",
    description: "Seatora (seatora.co.in) is an independent NEET PG counselling planner built on MCC and NBEMS documents: who runs it, what it covers and what it doesn't.",
  },
  "/pricing": {
    title: `Pricing: NEET PG 2026 Season Pass, ${price} once`,
    description: `Seatora pricing: a free account, or full access for ${price} once for the NEET PG 2026 season (until ${longDate(SEASON_PASS_UNTIL)}). No subscription, nothing renews.`,
  },
  "/neet-pg/cutoff": {
    title: "NEET PG Cutoff 2026 & Previous Year Closing Ranks",
    description: "NEET PG cutoff 2026 and previous years (2023–2025): last rank by round and branch from MCC's results, AIQ, deemed and DNB. State quota not covered.",
  },
  "/neet-pg/college-predictor": {
    title: "NEET PG College Predictor 2026 by Rank",
    description: "NEET PG college predictor 2026 from MCC's closing ranks: enter your AIR and category to see where ranks like yours were allotted. History, not a promise.",
  },
  "/neet-pg/counselling-2026": {
    title: "NEET PG Counselling 2026: Dates, Rounds, Results",
    description: "NEET PG counselling 2026 dates from MCC's notices: Round 1, Round 2 result, Round 3 and stray round schedule, deposits and upgrades. AIQ only.",
  },
  "/neet-pg/stipend-bond": {
    title: "NEET PG Stipend & Bond: State and College-wise",
    description: "NEET PG stipend and service bond by state and college: monthly stipends, bond years and penalties for MCC seats, from official documents.",
  },
} as const;

/**
 * A public page's <head>: title, description, canonical and Open Graph. A page's openGraph replaces the layout's whole,
 * so the site name, type and the share image (app/opengraph-image.tsx) are repeated here.
 */
export function pageMeta(path: string, { title, description }: { title: string; description: string }, absolute = false): Metadata {
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: siteConfig.name, title, description, url: path, images: { url: "/opengraph-image", width: 1200, height: 630 } },
  };
}

/** One JSON-LD block, "<" escaped so no string in it can close the script. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") }} />;
}

const url = siteConfig.url;
const at = (path: string) => `${url}${path === "/" ? "" : path}`;
/** The brand, said so a reader (or a model) can't take it for another "Seatora". */
export const DEFINITION =
  "Seatora (seatora.co.in) is an independent online planner for NEET PG counselling in India. It covers MCC's All India counselling: the All India Quota, deemed and central universities, and DNB seats, with past allotments and closing ranks by round, seat lists, fees, stipends, bonds and the residents at each college, each figure linked to its official document. It does not cover state quota counselling, and it is not affiliated with MCC, NBEMS or NMC.";

export const organizationLd = {
  "@type": "Organization",
  "@id": `${url}/#organization`,
  name: siteConfig.name,
  url,
  logo: { "@type": "ImageObject", url: `${url}/icons/icon-512.png`, width: 512, height: 512 },
  description: DEFINITION,
  ...(siteConfig.contactEmail && { email: siteConfig.contactEmail }),
  // sameAs: none yet; add the real profiles (Instagram, LinkedIn…) once they exist.
};

export const websiteLd = {
  "@type": "WebSite",
  "@id": `${url}/#website`,
  name: siteConfig.name,
  alternateName: ["Seatora NEET PG counselling planner", "seatora.co.in"],
  url,
  inLanguage: "en-IN",
  publisher: { "@id": organizationLd["@id"] },
  // No SearchAction: the site has no public search page.
};

export const appLd = {
  "@type": "WebApplication",
  "@id": `${url}/#app`,
  name: siteConfig.name,
  url,
  description: siteConfig.description,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: "en-IN",
  publisher: { "@id": organizationLd["@id"] },
  featureList: [
    "Last rank by branch for each MCC NEET PG round",
    "College-wise closing ranks by round, quota and category",
    "MCC seat lists (seat matrix)",
    "Fees, stipends, bonds and seat-leaving penalties",
    "Residents at each college by course and year, from MCC's admitted candidates lists (counts public, names for signed-in members)",
    "Choice list builder",
  ],
  offers: [
    { "@type": "Offer", name: "Free account", price: "0", priceCurrency: "INR", url: at("/pricing") },
    { "@type": "Offer", name: `${PLANS.season_pass.description}, NEET PG 2026 season`, price: String(PLANS.season_pass.amount / 100), priceCurrency: PLANS.season_pass.currency, url: at("/pricing") },
  ],
};

/** Home → … → this page, as [name, path] pairs. */
export const breadcrumbLd = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: at(path) })),
});

/** The questions and answers a page shows (Google: only visible ones); an answer with no plain text is left out. */
export const faqLd = (items: { q: string; text: string | null }[]) => ({
  "@type": "FAQPage",
  mainEntity: items.flatMap((f) => (f.text ? [{ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } }] : [])),
});
