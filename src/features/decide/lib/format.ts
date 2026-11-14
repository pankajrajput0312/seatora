/** ₹ in lakh with up to 2 decimals: 125000 → "₹1.25 L", 2450000 → "₹24.5 L". Null → "—". */
export function formatLakh(inr: number | null): string {
  if (inr == null) return "—";
  return `₹${Number((inr / 100000).toFixed(2))} L`;
}

/** ₹ short form: under 1 L in full Indian grouping (₹55,200), then lakh (₹1.5 L) and crore (₹2 Cr). Null → "—". */
export function formatInrShort(inr: number | null): string {
  if (inr == null) return "—";
  if (inr >= 1e7) return `₹${Number((inr / 1e7).toFixed(2))} Cr`;
  return inr >= 1e5 ? formatLakh(inr) : `₹${inr.toLocaleString("en-IN")}`;
}

/** Bond years from free text like "2 years" or "1 yr service"; null when not stated. */
export function bondYears(text: string | undefined): number | null {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(?:yrs?|years?)/i);
  return m ? Number(m[1]) : null;
}

/**
 * First rupee figure in a term's text, for sorting and fee caps only (the text is what's shown): "₹1.25 L/yr" → 125000,
 * "₹78,000 / 80,000 / 83,000/month (yr 1/2/3)" → 78000 (year 1). Null when the text has none.
 */
export function firstRupees(text: string | undefined | null): number | null {
  const m = text?.match(/₹\s?(\d[\d,]*(?:\.\d+)?)\s*(L\b|lakh)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return m[2] ? Math.round(n * 100000) : n;
}
