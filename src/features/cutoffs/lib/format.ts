const inr = new Intl.NumberFormat("en-IN");
const inrCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Ranks use Indian digit grouping: 1,23,456. Null means data not available. */
export function formatRank(rank: number | null): string {
  return rank == null ? "—" : inr.format(rank);
}

export function formatINR(amount: number | null): string {
  return amount == null ? "—" : inrCurrency.format(amount);
}
