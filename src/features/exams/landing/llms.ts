// /llms.txt and /llms-full.txt (llmstxt.org): Seatora in plain Markdown for AI answer engines: what it covers and what
// it doesn't, its public pages, and (full) the latest round's last rank by branch and the FAQs, every figure from the data.
import "server-only";
import { faqs, faqText } from "@/components/marketing/faq";
import { priceLine } from "@/components/marketing/price-line";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import type { Category } from "@/features/decide/types";
import { DEFINITION } from "@/lib/seo";
import { cutoffPath, cutoffWords } from "./cutoff";
import { cutoffPage, cutoffRounds, landingData, residentCounts } from "./data";
import { cutoffText } from "./words";

const n = formatRank;
const at = (path: string) => `${siteConfig.url}${path}`;
const qa = (xs: { q: string; text: string | null }[]) => xs.flatMap((f) => (f.text ? [`### ${f.q}`, "", f.text, ""] : []));

export async function llmsText(full: boolean) {
  const [landing, rounds, residents] = await Promise.all([landingData("neet-pg").catch(() => null), cutoffRounds(), residentCounts(null).catch(() => null)]);
  const k = landing?.counts;
  const latest = rounds[0];
  const lines = [
    `# ${siteConfig.name}`,
    "",
    `> ${DEFINITION}`,
    "",
    `Not to be confused with any other business or product called Seatora: this is the NEET PG counselling planner at ${siteConfig.url}.`,
    "",
    ...(k
      ? [
          `Data today: ${n(k.institutes)} institutes, ${n(k.courses)} courses and ${n(k.allotments)} allotments in MCC's NEET PG results from ${k.first} to ${k.last} (${n(k.resultPdfs)} result PDFs), ${n(k.seatLists)} MCC seat lists, ${n(k.termDocs)} fee, stipend and bond documents and ${n(k.notices)} MCC notices${residents ? `; ${n(residents.n)} residents, ${residents.y0} to ${residents.y1}` : ""}.`,
          "",
        ]
      : []),
    "## What Seatora covers",
    "",
    "- MCC (Medical Counselling Committee) NEET PG counselling: All India Quota seats of government medical colleges, deemed and central universities, and DNB seats.",
    "- Allotment results and closing (last) ranks by round, quota and seat category, from MCC's result PDFs.",
    "- MCC seat lists (seat matrix): clear vacancy, virtual vacancy and newly added seats.",
    "- Fees, stipends, service bonds and seat-leaving penalties, from MCC and institute documents.",
    "- Residents at each college by course and year, from MCC's admitted-candidates lists (names for signed-in members only; no contact details).",
    "- MCC notices and where each counselling round stands.",
    "",
    "## What it does not cover",
    "",
    "- State quota counselling: each state runs its own.",
    "- Predictions or guarantees: a closing rank is what happened in a past round, not a prediction.",
    "- Seatora is independent: not affiliated with MCC, NBEMS, NMC or any counselling authority.",
    "",
    "## Key pages",
    "",
    `- [Home](${at("/")}): the planner, the latest round's last rank by branch, and the FAQ.`,
    `- [NEET PG counselling](${at("/neet-pg")}): what MCC's counselling covers, closing ranks by round, where counselling stands.`,
    ...(latest ? [`- [${cutoffWords(latest).name}${latest.provisional ? " (provisional)" : ""}](${at(cutoffPath(latest))}): last rank by branch, quota and category.`] : []),
    `- [Pricing](${at("/pricing")}): ${priceLine()}`,
    `- [About](${at("/about")}): what Seatora is and who runs it.`,
    "",
    "## Optional",
    "",
    ...(full ? [] : [`- [Full text](${at("/llms-full.txt")}): the latest round's last rank by branch as tables, and the FAQs.`]),
    ...rounds.slice(1).map((r) => `- [${cutoffWords(r).name}](${at(cutoffPath(r))})`),
    "",
  ];
  if (!full) return lines.join("\n");

  const page = latest ? await cutoffPage(cutoffPath(latest)).catch(() => null) : null;
  if (!page) return lines.join("\n");
  const { d } = page;
  const round = roundName[d.round];
  return [
    ...lines,
    `## ${cutoffWords(page.at).h1}`,
    "",
    ...cutoffText(page).intro,
    "",
    `Source: ${d.source.name}${d.source.url ? ` (${d.source.url})` : ""}. Page: ${at(d.path)}`,
    "",
    ...d.tabs.flatMap((t) => {
      const cats: Category[] = t.pwd ? [...t.cats, ...t.cats.map((c) => `${c} PwD` as const)] : [...t.cats];
      return t.rows.length
        ? [
            `### ${t.label}`,
            "",
            `| Branch | ${cats.join(" | ")} | ${d.round === "R1" ? "Allotments" : "New allotments"} |`,
            `|---|${cats.map(() => "---:").join("|")}|---:|`,
            ...t.rows.map((r) => `| ${r.course} | ${cats.map((c) => (r.last[c] == null ? "—" : n(r.last[c]))).join(" | ")} | ${n(r.n)} |`),
            "",
          ]
        : [];
    }),
    ...(d.restricted.length ? ["### Restricted quotas", "", "| Quota | Branch | Last rank |", "|---|---|---:|", ...d.restricted.map((r) => `| ${r.quota} | ${r.course} | ${n(r.max)} |`), ""] : []),
    `## Questions about the ${round} cutoff`,
    "",
    ...qa(cutoffText(page).faqs.map((f) => ({ q: f.q, text: f.a }))),
    "## Questions aspirants ask",
    "",
    ...qa(faqs().map((f) => ({ q: f.q, text: faqText(f) }))),
  ].join("\n");
}
