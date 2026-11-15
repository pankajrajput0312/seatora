import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { collegeTypeLabel, collegeTypeTone, typeNote, type CollegeType } from "./institute/college-type";
import { InfoTip } from "./info-tip";

/**
 * The college type as a coloured badge ("Government" green, "Deemed" blue, "Private" / "Trust" neutral) and an (i)
 * saying how it was arrived at (inferred from name and quota, or Seatora's research; never official), by tap or
 * keyboard. `of`: the row or college, so each (i) on a list is named apart ("About college type, AIIMS Delhi").
 */
export function TypeBadge({ type, of, className }: { type: CollegeType; of?: string; className?: string }) {
  const label = collegeTypeLabel[type.value];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <Badge tone={collegeTypeTone[type.value]}>{label}</Badge>
      <InfoTip label={of ? `college type, ${of}` : "college type"}>
        <span className="font-semibold">{label}</span>: {typeNote(type)}
      </InfoTip>
    </span>
  );
}
