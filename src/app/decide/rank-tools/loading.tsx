import { LoadingPage, SkFilters, SkHead, SkPanel, Skeleton } from "@/features/decide/components/skeleton";

// Score & rank: score, rank and category, then the two answers.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-60" sub="w-96" />
      <SkFilters n={4} labels cols="md:grid-cols-[1fr_1fr_1fr_auto]" />
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SkPanel lines={2} />
        <SkPanel lines={2} />
      </div>
    </LoadingPage>
  );
}
