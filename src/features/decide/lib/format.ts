/** "13 Nov 2026" from YYYY-MM-DD. */
export const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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

/** A seat list PDF's day (YYYY-MM-DD), to tell two lists of one kind in a round apart: the date in its key ("…_2025-12-11.pdf"), else its notice date. */
export const listDay = (l: { key: string; publishedAt: string | null }) => l.key.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? l.publishedAt ?? undefined;
