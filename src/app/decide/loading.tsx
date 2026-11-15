import { LoadingPage, SkHead, SkPanel, SkStats, Skeleton } from "@/features/decide/components/skeleton";

// Overview: round status, the seats strip, the label bars beside the top choices.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w="w-60" sub="w-40" />
      <SkPanel lines={2} />
      <Skeleton className="h-6 w-72" />
      <SkStats />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <SkPanel lines={6} />
        <SkPanel lines={1} className="self-start" />
      </div>
    </LoadingPage>
  );
}
