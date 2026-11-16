import { fmtDay } from "../../lib/format";
import type { ReportedBeds } from "../institute/institute-data";
import { flagShort, reportedCount, SELF_REPORTED, ValueSource } from "../institute/hospital-bits";
import { InfoTip } from "../info-tip";
import { SourceRef } from "../page-sources";

/**
 * The one way beds show: as the source prints them ("270+" where rounded), the count's own flags in warning ink ("old
 * figure", "conflicting figures", "derived"); behind the (i) its kind, period, "self-reported", source link, check date
 * and flags, and the source in the page's Sources footer. `inst`: the institute (the footer entry's name); `of`: the row
 * ("R G KAR MEDICAL COLLEGE, MD Anaesthesiology"), for the button's name. `unit`: "1,538 beds" (a card's meta line).
 * Server- and client-safe.
 */
export function Beds({ b, inst, of = inst, unit }: { b: ReportedBeds; inst: string; of?: string; unit?: boolean }) {
  const c = reportedCount(b);
  const m = c.meta;
  // "old figure (2022)": the year its period names (the last one, "January 2021 To December 2023" → 2023); none when not stated.
  const year = m?.period && !/^not stated/i.test(m.period) ? m.period.match(/\b(?:19|20)\d{2}\b/g)?.at(-1) : undefined;
  const flags = c.flags.flatMap((x) => (flagShort[x] ? [x === "old" && year ? `${flagShort[x]} (${year})` : flagShort[x]!] : []));
  return (
    <span className="inline-flex items-center gap-0.5">
      <span>
        <span className="numeric">{c.text}</span>
        {unit && " beds"}
        {flags.length > 0 && <span className="ml-1 text-xs font-normal text-sun">{flags.join(", ")}</span>}
      </span>
      <InfoTip label={`beds, ${of}`}>
        <span className="block font-semibold">
          {c.text} beds{b.kind && `, ${b.kind}`}
          {m && <SourceRef doc={{ name: `${inst}: beds as the hospital reports them`, url: m.url, note: `${SELF_REPORTED}. Period: ${m.period}. Checked ${fmtDay(m.checked)}.` }} />}
        </span>
        {m?.period && <span className="block">Period: {m.period}</span>}
        <span className="mt-1 block">{SELF_REPORTED}.</span>
        <span className="mt-1 block"><ValueSource m={m} /></span>
      </InfoTip>
    </span>
  );
}
