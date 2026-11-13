import { Badge } from "./badge";
import type { Provenance, SourceType } from "@/types/provenance";

const labels: Record<SourceType, { text: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  OFFICIAL: { text: "Official", tone: "success" },
  VERIFIED_INSTITUTIONAL: { text: "Verified institutional", tone: "info" },
  THIRD_PARTY_RESEARCH: { text: "Third-party research", tone: "neutral" },
  STUDENT_REPORTED: { text: "Student-reported", tone: "neutral" },
  UNVERIFIED_COMMUNITY: { text: "Unverified", tone: "warning" },
};

/** Required next to any displayed college, cutoff, fee or announcement data. */
export function SourceLabel({ provenance }: { provenance: Pick<Provenance, "sourceName" | "sourceUrl" | "sourceType" | "academicYear"> }) {
  const { text, tone } = labels[provenance.sourceType];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <Badge tone={tone}>{text}</Badge>
      {provenance.sourceUrl ? (
        <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">
          {provenance.sourceName}
        </a>
      ) : (
        provenance.sourceName
      )}
      <span className="numeric">· {provenance.academicYear}</span>
    </span>
  );
}
