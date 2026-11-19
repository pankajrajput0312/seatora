import { Badge } from "./badge";
import type { Provenance, SourceType } from "@/types/provenance";

/** Trust tier → badge (docs/DATA_INTEGRITY.md). */
export const sourceTypeLabels: Record<SourceType, { text: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  OFFICIAL: { text: "Official", tone: "success" },
  VERIFIED_INSTITUTIONAL: { text: "Verified institutional", tone: "info" },
  THIRD_PARTY_RESEARCH: { text: "Third-party research", tone: "neutral" },
  STUDENT_REPORTED: { text: "Student-reported", tone: "neutral" },
  UNVERIFIED_COMMUNITY: { text: "Unverified", tone: "warning" },
};

/** Required next to any displayed college, cutoff, fee or announcement data. Wraps as text (long document names); no year: none shown. */
export function SourceLabel({ provenance }: { provenance: Pick<Provenance, "sourceName" | "sourceUrl" | "sourceType" | "academicYear"> }) {
  const { text, tone } = sourceTypeLabels[provenance.sourceType];
  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      <Badge tone={tone} className="mr-2">{text}</Badge>
      {provenance.sourceUrl ? (
        <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">
          {provenance.sourceName}
        </a>
      ) : (
        provenance.sourceName
      )}
      {provenance.academicYear && <span className="numeric whitespace-nowrap">, {provenance.academicYear}</span>}
    </span>
  );
}
