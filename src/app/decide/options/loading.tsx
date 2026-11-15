import { LoadingPage, SkChips, SkFilters, SkHead, SkTable, SkToolbar, Skeleton } from "@/features/decide/components/skeleton";

// Options: summary line, filters, reach chips, results table.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-4">
      <SkHead w="w-48" sub="w-96" />
      <Skeleton className="h-5 w-3/4" />
      <SkFilters n={14} cols="md:grid-cols-6" />
      <SkChips n={8} />
      <Skeleton className="h-5 w-56" />
      <SkToolbar />
      <SkTable rows={6} cols={9} />
    </LoadingPage>
  );
}
