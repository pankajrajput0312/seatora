import { LoadingPage, SkHead, SkPanel, Skeleton } from "@/features/decide/components/skeleton";

// Request a feature: the form, then her requests.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-8">
      <SkHead w="w-80" sub="w-72" />
      <SkPanel lines={6} className="max-w-3xl" />
      <Skeleton className="h-6 w-40" />
    </LoadingPage>
  );
}
