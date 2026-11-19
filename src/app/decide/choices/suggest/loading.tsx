import { LoadingPage, SkHead, SkToolbar, Skeleton } from "@/features/decide/components/skeleton";

// Suggest my list: the title, its note, the limits, the actions, the list.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-3">
      <SkHead text="Suggest my Choice list" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <SkToolbar />
      <Skeleton className="h-[60dvh] w-full rounded-xl" />
    </LoadingPage>
  );
}
