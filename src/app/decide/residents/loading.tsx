import { SkListPage } from "@/features/decide/components/skeleton";

// Residents: filters, the rank window line, then the list.
export default function Loading() {
  return <SkListPage title="w-56" sub="w-[36rem]" filters={10} cols={7} />;
}
