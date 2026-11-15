import { LoadingPage, SkChips, SkHead, SkPanel, Skeleton } from "@/features/decide/components/skeleton";

// Counselling: tabs, then the round-by-round schedule.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-64" sub="w-96" />
      <SkChips n={3} tabs />
      <Skeleton className="h-6 w-80" />
      <SkPanel lines={6} />
      <SkPanel lines={6} />
    </LoadingPage>
  );
}
