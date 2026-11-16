import { cn } from "@/lib/cn";
import { feeBandText } from "../lib/stat-format";
import { InfoTip } from "./info-tip";
import { collegeTypeClass } from "./institute/college-type";
import { levelClass } from "./stat-cells";

// The colour key (docs/APP_DESIGN_SYSTEM.md "Colour key") behind one (i): what each colour on a page means, each with
// its words. Colour is never the only signal: every value and badge also says it in text. Spans only (it may sit in a <p>).

const badge = "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium";
const Row = ({ head, children }: { head: string; children: React.ReactNode }) => (
  <span className="mt-2 block">
    <span className="block font-semibold">{head}</span>
    <span className="flex flex-wrap gap-x-3 gap-y-1">{children}</span>
  </span>
);
const Val = ({ c, children }: { c: string; children: React.ReactNode }) => <span className={cn("numeric font-semibold", c)}>{children}</span>;

export function ColourLegend({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs text-muted-foreground", className)}>
      Colour key
      <InfoTip label="colour key">
        <span className="block">Colours repeat what the words say; the words always carry it.</span>
        <Row head="College type">
          <span className={cn(badge, collegeTypeClass.govt)}>Government</span>
          <span className={cn(badge, collegeTypeClass.central)}>Central government</span>
          <span className={cn(badge, collegeTypeClass.esic)}>ESIC</span>
          <span className={cn(badge, collegeTypeClass.deemed)}>Deemed</span>
          <span className={cn(badge, collegeTypeClass.trust)}>Trust</span>
          <span className={cn(badge, collegeTypeClass.private)}>Private</span>
        </Row>
        <Row head="Bond">
          <Val c={levelClass.good}>No bond</Val>
          <Val c="">No bond (no colour): private / trust status inferred from the name, or a state rule may apply</Val>
          <Val c={levelClass.caution}>1Y–2Y</Val>
          <Val c={levelClass.strong}>3Y or more</Val>
          <Val c={levelClass.heavy}>₹25 L or more to pay</Val>
          <Val c="text-muted-foreground font-normal">None declared / Not published / —</Val>
        </Row>
        <Row head="Fee a year">
          <Val c={levelClass.good}>low</Val>
          <Val c="">middle (no colour)</Val>
          <Val c={levelClass.heavy}>high</Val>
        </Row>
        <span className="block text-muted-foreground">{feeBandText}</span>
        <Row head="Stipend a month">
          <Val c={levelClass.caution}>below NBEMS min</Val>
        </Row>
        <Row head="Seats in the round">
          <Val c="text-leaf">clear</Val>
          <Val c="text-sun">virtual</Val>
          <Val c="text-sky">newly added</Val>
        </Row>
        <Row head="Your reach">
          <span className={cn(badge, "bg-sky/10 text-sky")}>Reached</span>
          <span className={cn(badge, "bg-sun/10 text-sun")}>Within 10%</span>
          <span className={cn(badge, "bg-muted text-muted-foreground")}>Closed before / no data / never allotted before</span>
        </Row>
      </InfoTip>
    </span>
  );
}
