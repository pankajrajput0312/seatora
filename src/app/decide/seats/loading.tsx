import { LoadingPage, SkChips, SkFilters, SkHead, SkTable, SkToolbar, Skeleton } from "@/features/decide/components/skeleton";

// Seats: tabs, list chips, view chips, filters, totals, the matrix.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-40" />
      <SkChips n={2} tabs />
      <SkChips n={4} />
      <SkChips n={5} />
      <SkFilters n={16} cols="md:grid-cols-6" />
      <SkToolbar />
      <Skeleton className="h-5 w-1/2" />
      <SkTable rows={6} cols={8} />
    </LoadingPage>
  );
}
