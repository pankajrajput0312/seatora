/**
 * A rank as typed: digits with optional commas or spaces ("25,000", "2,50,000", " 25000 "). Anything else ("25000.5",
 * "25k", "-5", "1e5") is NaN, so the form says it isn't a rank instead of reading the digits it can find (25000.5 → 250005).
 */
export const parseRankText = (text: string) => {
  const t = text.replace(/[\s,]/g, "");
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
};
