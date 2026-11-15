import { LoadingPage, SkCards, SkFilters, SkHead, SkToolbar } from "@/features/decide/components/skeleton";

// Allotments: filters, then allotment cards.
export default function Loading() {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead text="Allotments" sub="w-80" />
      <SkFilters n={14} labels cols="md:grid-cols-6" />
      <SkToolbar />
      <SkCards n={4} />
    </LoadingPage>
  );
}
