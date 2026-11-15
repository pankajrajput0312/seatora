import { SkListPage } from "@/features/decide/components/skeleton";

// Rank scan: filters, then allotments around the rank.
export default function Loading() {
  return <SkListPage title="w-56" filters={11} cols={7} />;
}
