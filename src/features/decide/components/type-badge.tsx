import { cn } from "@/lib/cn";
import { collegeTypeClass, collegeTypeGroup, collegeTypeLabel, typeNote, type CollegeType } from "./institute/college-type";
import { InfoTip } from "./info-tip";

/**
 * The college type as a coloured badge (colour group: college-type.ts collegeTypeGroup; the colour key is in its (i))
 * and an (i) saying how it was arrived at (inferred from name and quota, or Seatora's research; never official), by tap
 * or keyboard. `of`: the row or college, so each (i) on a list is named apart ("About college type, AIIMS Delhi").
 */
export function TypeBadge({ type, of, className }: { type: CollegeType; of?: string; className?: string }) {
  const label = collegeTypeLabel[type.value];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {/* Badge's shape, its own colours (Badge's tones would clash: cn does not merge classes). */}
      <span className={cn("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium", collegeTypeClass[collegeTypeGroup[type.value]])}>{label}</span>
      <InfoTip label={of ? `college type, ${of}` : "college type"}>
        <span className="font-semibold">{label}</span>: {typeNote(type)}
        <span className="mt-1 block text-muted-foreground">
          Colours: green Govt, plum Govt-Private, violet Public Sector, teal AFMS, blue Deemed, grey Private.
        </span>
      </InfoTip>
    </span>
  );
}
