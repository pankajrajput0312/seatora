import { SkListPage } from "@/features/decide/components/skeleton";

// Fees, stipend and bond: filters, then one row per institute and programme.
export default function Loading() {
  return <SkListPage heading="Fees, stipend and bond" sub="w-56" filters={13} labels={false} cols={6} />;
}
