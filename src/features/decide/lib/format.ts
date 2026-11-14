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
