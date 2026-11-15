import { LoadingPage, SkFilters, SkHead, Skeleton } from "@/features/decide/components/skeleton";

// Rank journey: rank and year, then the rank's rounds.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-64" sub="w-48" />
      <SkFilters n={3} labels cols="md:grid-cols-[1fr_1fr_auto]" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </LoadingPage>
  );
}
