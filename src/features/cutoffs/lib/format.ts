const inr = new Intl.NumberFormat("en-IN");
const inrCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Ranks use Indian digit grouping: 1,23,456. Null means data not available. */
export function formatRank(rank: number | null): string {
  return rank == null ? "—" : inr.format(rank);
}

/** A rank where there is no room for every digit (the phone header's chip): "42k", "1.5k", "980"; never a cut-off number. */
export function compactRank(rank: number): string {
  if (rank < 1000) return String(rank);
  const k = rank / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}k`;
}

export function formatINR(amount: number | null): string {
  return amount == null ? "—" : inrCurrency.format(amount);
}
