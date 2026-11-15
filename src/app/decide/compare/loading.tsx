import { LoadingPage, SkHead, Skeleton } from "@/features/decide/components/skeleton";

// Compare: the side-by-side table.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-52" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </LoadingPage>
  );
}
