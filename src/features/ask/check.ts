// The answer check (pure, tested): before an answer is final, every rank-, seat- or rupee-sized number in it must
// appear in what this turn was given (tool results, the question, earlier turns, her profile), and every Seatora link
// must be a real page. The agent asks the model once to correct what fails (agent.ts).

/** Numbers ≥ 1000 written with or without Indian/Western commas ("45,409", "1,37,868", "42284"), years 1990-2100 aside. */
export function bigNumbers(text: string): number[] {
  return [...text.matchAll(/(?<![\d.,])\d{1,3}(?:,\d{2,3})+(?![\d,]*\d)|(?<![\d.,])\d{4,}(?![\d.])/g)]
    .map((m) => Number(m[0].replace(/,/g, "")))
    .filter((n) => n >= 1000 && !(n >= 1990 && n <= 2100));
}

/** Rupee amounts in lakh or crore ("₹33 L", "₹1.25 L", "₹1.5 Cr") as rupees. */
export function lakhAmounts(text: string): number[] {
  return [...text.matchAll(/₹\s?(\d+(?:\.\d+)?)\s?(L|lakh|Cr|crore)\b/gi)].map((m) => Math.round(Number(m[1]) * (/^c/i.test(m[2]) ? 1e7 : 1e5)));
}

const STATIC = new Set(["/decide", "/decide/options", "/decide/seats", "/decide/choices", "/decide/compare", "/decide/counselling", "/decide/institutes", "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/rank-tools", "/decide/fees", "/decide/residents", "/decide/requests", "/decide/ask"]);

/** A site path is a Seatora page: a known route, an institute by a slug that exists, or a report link. */
export function knownRoute(href: string, slugs: Set<string>): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (STATIC.has(path)) return true;
  const inst = /^\/decide\/institutes\/([a-z0-9-]+)$/.exec(path);
  if (inst) return slugs.has(inst[1]);
  return /^\/decide\/ask\/report\/[a-z0-9]{10,40}$/.test(path);
}

export type CheckResult = { passed: number; failed: number; missingNumbers: string[]; badLinks: string[] };

export function checkAnswer(answer: string, given: string, slugs: Set<string>): CheckResult {
  const known = new Set([...bigNumbers(given), ...lakhAmounts(given)]);
  const prose = answer.replace(/\]\([^)\s]*\)/g, "]"); // a link's target (an institute slug's PIN) is not a figure
  const nums = [...new Set(bigNumbers(prose))];
  const lakhs = [...new Set(lakhAmounts(prose))];
  // A lakh figure passes if the same "₹x L" text or its rupee value is in the sources.
  const missingNumbers = [...nums.filter((n) => !known.has(n)).map((n) => n.toLocaleString("en-IN")), ...lakhs.filter((n) => !known.has(n)).map((n) => `₹${n / 1e5} L`)];
  const links = [...answer.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
  const badLinks = [...new Set(links.filter((l) => !knownRoute(l, slugs)))];
  const total = nums.length + lakhs.length + links.length;
  const failed = missingNumbers.length + badLinks.length;
  return { passed: total - failed, failed, missingNumbers, badLinks };
}
