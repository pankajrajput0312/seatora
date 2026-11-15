import { LoadingPage, SkChips, SkHead, SkToolbar, Skeleton } from "@/features/decide/components/skeleton";

// Choices: list tabs, the actions row, the list.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-48" />
      <SkChips n={2} />
      <SkToolbar />
      <Skeleton className="h-72 w-full rounded-xl" />
    </LoadingPage>
  );
}
