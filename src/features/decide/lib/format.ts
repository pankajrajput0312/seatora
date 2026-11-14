/** "13 Nov 2026" from YYYY-MM-DD. */
export const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** ₹ in lakh with up to 2 decimals: 125000 → "₹1.25 L", 2450000 → "₹24.5 L". Null → "—". */
export function formatLakh(inr: number | null): string {
  if (inr == null) return "—";
  return `₹${Number((inr / 100000).toFixed(2))} L`;
}

/** Bond years from free text like "2 years" or "1 yr service"; null when not stated. */
export function bondYears(text: string | undefined): number | null {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(?:yrs?|years?)/i);
  return m ? Number(m[1]) : null;
}

/** Every rupee figure in a text, in order, lakh and crore aware: "₹50 lakh … ₹25 L – ₹1.5 Cr" → [5000000, 2500000, 15000000]. */
export function rupees(text: string | undefined | null): number[] {
  return [...(text ?? "").matchAll(/₹\s?(\d[\d,]*(?:\.\d+)?)\s*(L\b|lakh|crore|Cr\b)?/gi)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    return m[2] ? Math.round(n * (/^c/i.test(m[2]) ? 10000000 : 100000)) : n;
  });
}

/**
 * First rupee figure in a term's text, for sorting and fee caps only (the text is what's shown): "₹1.25 L/yr" → 125000,
 * "₹78,000 / 80,000 / 83,000/month (yr 1/2/3)" → 78000 (year 1). Null when the text has none.
 */
export const firstRupees = (text: string | undefined | null): number | null => rupees(text)[0] ?? null;

/**
 * Year-1 stipend from a published stipend text, its qualifier kept: "₹66,100 / 67,800 / 69,500/month (yr 1/2/3) — …" →
 * "₹66,100/month", "At least ₹45,000/month yr 1 (…)" → "At least ₹45,000/month". Null when it doesn't start with a
 * monthly ₹ figure (show the text instead).
 */
export function stipendYear1(text: string | undefined | null): string | null {
  const m = text?.match(/^(at least )?₹\s?(\d[\d,]*)(?:\s*\/\s*[\d,]+)*\s*\/\s*month/i);
  return m ? `${m[1] ? "At least " : ""}₹${m[2]}/month` : null;
}

/**
 * A service bond text's own figures: every distinct ₹ amount and year figure once its "seat-leaving penalty" clause (a
 * state's penalty, not the bond) is cut, up to "; applies to". One of each is the bond's; several mean it varies (degree
 * vs diploma, in-service, super-specialty, two undertakings…) and only the text says which applies.
 */
export function bondFigures(text: string | undefined | null): { inr: number[]; years: number[] } {
  const bond = (text ?? "").replace(/seat-leaving penalty.*?(?=; applies to|$)/i, "");
  // "3 years' stipend" is an amount, not a period.
  const years = [...bond.matchAll(/(\d+(?:\.\d+)?)\s*(?:yrs?|years?)\b(?!')/gi)].map((m) => Number(m[1]));
  return { inr: [...new Set(rupees(bond))], years: [...new Set(years)] };
}

/** A seat list PDF's day (YYYY-MM-DD), to tell two lists of one kind in a round apart: the date in its key ("…_2025-12-11.pdf"), else its notice date. */
export const listDay = (l: { key: string; publishedAt: string | null }) => l.key.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? l.publishedAt ?? undefined;
