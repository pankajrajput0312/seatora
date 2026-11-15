import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { collegeTypeLabel, collegeTypeTone, inferred, typeNote, type CollegeType } from "./institute/college-type";
import { InfoTip } from "./info-tip";

/**
 * The college type as a coloured badge ("Government" green, "Deemed" blue, "Private" / "Trust" neutral). An inferred
 * type (name and quota, never an official field) has an (i) saying so; a researched one says it in its title. `of`: the
 * row or college, so each (i) on a list is named apart ("About college type, AIIMS Delhi").
 */
export function TypeBadge({ type, of, className }: { type: CollegeType; of?: string; className?: string }) {
  const label = collegeTypeLabel[type.value];
  const why = typeNote(type);
  if (!inferred(type)) {
    return (
      <Badge tone={collegeTypeTone[type.value]} title={why} className={className}>
        {label}
        <span className="sr-only">: {why}</span>
      </Badge>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <Badge tone={collegeTypeTone[type.value]}>{label}</Badge>
      <InfoTip label={of ? `college type, ${of}` : "college type"}>
        <span className="font-semibold">{label}</span>: {why}
      </InfoTip>
    </span>
  );
}
