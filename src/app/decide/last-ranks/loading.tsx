import { SkListPage } from "@/features/decide/components/skeleton";

// Last ranks: filters, then closing ranks by year and round.
export default function Loading() {
  return <SkListPage title="w-56" sub="w-40" filters={11} cols={10} />;
}
