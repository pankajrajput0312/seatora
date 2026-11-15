import { LoadingPage, SkChips, SkPanel, SkStats, Skeleton } from "@/features/decide/components/skeleton";

// One institute: breadcrumb, name, figures, tabs, the overview strip and panels.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <div className="grid gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-11 w-3/4 max-w-2xl" />
        <Skeleton className="h-6 w-60" />
      </div>
      <div className="grid grid-cols-3 gap-6 border-y border-border py-4">
        {[0, 1, 2].map((i) => <div key={i} className="grid gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /></div>)}
      </div>
      <SkChips n={7} tabs />
      <SkStats />
      <SkPanel lines={3} />
      <SkPanel lines={3} />
    </LoadingPage>
  );
}
