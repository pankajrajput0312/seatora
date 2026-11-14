import { SourceLabel } from "@/components/ui/source-label";
import { isDemoData } from "../service";

/** Source label for a data block, driven by the data (not hard-coded): demo label now, MCC once live. */
export async function DataSource() {
  const demo = await isDemoData();
  return demo ? (
    <SourceLabel provenance={{ sourceName: "Demo data — illustrative only", sourceUrl: null, sourceType: "UNVERIFIED_COMMUNITY", academicYear: "2026-27" }} />
  ) : (
    <SourceLabel provenance={{ sourceName: "MCC PG allotment results", sourceUrl: "https://mcc.nic.in/pg-medical-counselling/", sourceType: "OFFICIAL", academicYear: "2026-27" }} />
  );
}
