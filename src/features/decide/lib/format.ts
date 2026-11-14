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
