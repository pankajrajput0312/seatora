import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { CSV_MAX_ROWS } from "../api";
import { InfoTip } from "./info-tip";

/**
 * A results page's CSV download, after its Cards | Table toggle: the same "CSV" button on every page (`what` names it
 * for screen readers: "these 1,065 options"). `total` past CSV_MAX_ROWS (the export's cap): a greyed CSV with an (i).
 */
export function CsvLink({ href, what, total }: { href: string; what: string; total?: number }) {
  if (total != null && total > CSV_MAX_ROWS)
    return (
      <span className="inline-flex items-center gap-0.5">
        <span aria-disabled="true" className="inline-flex h-11 items-center gap-2 rounded-md border border-edge px-3 text-sm text-muted-foreground">
          <Download className="size-4" aria-hidden />CSV
        </span>
        <InfoTip label="the CSV download">
          These <span className="numeric">{formatRank(total)}</span> rows are more than one CSV download holds (<span className="numeric">{formatRank(CSV_MAX_ROWS)}</span>): narrow the filters to download them.
        </InfoTip>
      </span>
    );
  return (
    <Button asChild variant="secondary">
      <a href={href} download aria-label={`Download CSV of ${what}`}><Download className="size-4" aria-hidden />CSV</a>
    </Button>
  );
}

/** The row of a results count and its tools (tools wrap under the count when there is no room). In a .filter-row (globals.css) it fills the row after Filters. */
export const toolbarRow = "toolbar flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2";
