import { cn } from "@/lib/cn";
import { termChoices, termValueLabel, typeValues, withCurrent, type TermParams } from "../lib/term-filters";
import type { Profile } from "../profile";
import { FilterDropdown } from "./filter-dropdown";
import { InfoTip } from "./info-tip";
import { collegeTypeLabel } from "./institute/college-type";
import { control } from "./ui";

// The term filters' controls (lib/term-filters.ts params) for a GET filter form: FilterBar (grid) or a flex bar
// (Options, Seats). Native selects, checkboxes and <details>: they work without JS. Each select names itself in its
// options ("Fee up to ₹5 L/yr"), so it needs no visible label. List pages put them in their Filters panel.

const box = "w-full min-w-0 sm:w-auto sm:min-w-52";

function TermSelect({ name, label, value, any, options, className }: {
  name: string;
  label: string;
  value: string | number | undefined;
  any: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn(box, className)}>
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value == null ? "" : String(value)} className={control}>
        <option value="">{any}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const choices = (k: keyof typeof termChoices, v: number | null) => withCurrent(termChoices[k], v).map((n) => ({ value: String(n), label: termValueLabel[k](n) }));

/**
 * College type, fee/yr, bond years (incl. No bond), then stipend, bond ₹, leaving ₹ and
 * "Include not declared". `f`: the parsed params (readTermFilters(...).params). `caps`: her profile's fee and bond caps
 * where the page applies them (Options, Fees): "Your cap: …" is the default and "Any" clears it.
 */
export function TermFilterControls({ f, caps }: { f: TermParams; caps?: Pick<Profile, "maxFeeLakh" | "maxBondYears"> | null }) {
  const fee = caps?.maxFeeLakh ?? null;
  const yrs = caps?.maxBondYears ?? null;
  return (
    <>
      <FilterDropdown
        label="College type"
        name="ctype"
        options={typeValues.map((t) => ({ value: t, label: collegeTypeLabel[t] }))}
        selected={f.ctype ?? []}
        none="Any"
        noneNote="None ticked means any type. Types are inferred from the name and quota, not official."
      />
      <TermSelect
        name="maxfee"
        label="Fee per year, at most"
        value={f.maxfee}
        any={fee != null ? `Your cap: ${termValueLabel.maxfee(fee)}` : "Any fee"}
        options={[...(fee != null ? [{ value: "any", label: "Any fee" }] : []), ...choices("maxfee", num(f.maxfee))]}
      />
      <TermSelect
        name="bondyrs"
        label="Bond years, at most"
        value={f.bondyrs}
        any={yrs != null ? `Your cap: ${termValueLabel.bondyrs(yrs)}` : "Any bond"}
        options={[...(yrs != null ? [{ value: "any", label: "Any bond" }] : []), ...choices("bondyrs", num(f.bondyrs))]}
      />
      <TermSelect name="minstip" label="Stipend per month, at least" value={f.minstip} any="Any stipend" options={choices("minstip", f.minstip ?? null)} />
      <TermSelect name="maxbond" label="Bond amount, at most" value={f.maxbond} any="Any bond ₹" options={choices("maxbond", f.maxbond ?? null)} />
      <TermSelect name="maxleave" label="Leaving penalty, at most" value={f.maxleave} any="Any leaving ₹" options={choices("maxleave", f.maxleave ?? null)} />
      <span className="flex min-h-11 items-center gap-1 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" name="nd" value="keep" defaultChecked={f.nd === "keep"} className="size-5 accent-sky" />
          Include not declared
        </label>
        <InfoTip label="not declared">
          A college whose figure is not declared, or only in words, is left out of a fee, stipend, bond or leaving filter
          unless this is ticked. &quot;No bond&quot; only lists colleges whose record says no bond (ticked, also those where a
          state law&apos;s service may still apply), and a type filter never lists a college without a type.
        </InfoTip>
      </span>
    </>
  );
}
