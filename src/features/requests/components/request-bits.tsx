import { Badge } from "@/components/ui/badge";
import { REQUEST_STATUSES } from "../validations";

type Status = (typeof REQUEST_STATUSES)[number];

export const statusLabel: Record<Status, string> = { new: "New", planned: "Planned", done: "Done", declined: "Declined" };
// Signal colours carry meaning only: planned (sky) and done (leaf); new and declined stay neutral.
const tone = { new: "neutral", planned: "info", done: "success", declined: "neutral" } as const;

export function RequestStatusChip({ status }: { status: Status }) {
  return <Badge tone={tone[status]} className="shrink-0">{statusLabel[status]}</Badge>;
}

/** "15 Nov 2026", in India's time zone (a request sent at 2 am IST is that day's, not the UTC day before). */
export const requestDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The message's first non-empty line, for a one-line summary. */
export const firstLine = (message: string) => message.trim().split(/\r?\n/, 1)[0] ?? "";
