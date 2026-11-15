import { SkListPage } from "@/features/decide/components/skeleton";

// Institutes: filters, then the institutes table.
export default function Loading() {
  return <SkListPage heading="Institutes" filters={11} cols={7} />;
}
