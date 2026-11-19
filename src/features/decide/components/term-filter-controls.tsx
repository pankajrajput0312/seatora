import { termChoices, termValueLabel, typeValues, withCurrent, type TermParams } from "../lib/term-filters";
import type { Profile } from "../profile";
import { FilterDropdown } from "./filter-dropdown";
import { FilterSection } from "./filter-form";
import { typeCategoryLabel } from "./institute/college-type";
import { control, Field } from "./ui";
import { PgOr } from "./round-name";

// The term filters' controls (lib/term-filters.ts params) for the Filters sheet (FiltersPanel) of a list page: College
// type (a checkbox section), then one "Fees & bond" section with a row per figure (native selects; each option names its
// value, "Fee up to ₹5 L/yr") and "Include not published". They work without JS.

function TermSelect({ name, label, value, any, options }: {
  name: string;
  label: string;
  value: string | number | undefined;
  any: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value == null ? "" : String(value)} className={control}>
        <option value="">{any}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const choices = (k: keyof typeof termChoices, v: number | null) => withCurrent(termChoices[k], v).map((n) => ({ value: String(n), label: termValueLabel[k](n) }));

/**
 * College type, then fee/yr, bond years (incl. No bond), stipend, bond ₹, leaving ₹ and "Include not published".
 * `f`: the parsed params (readTermFilters(...).params). `caps`: her profile's fee and bond caps where the page applies
 * them (Options, Fees): "Your cap: …" is the default and "Any" clears it.
 */
export function TermFilterControls({ f, caps }: { f: TermParams; caps?: Pick<Profile, "maxFeeLakh" | "maxBondYears"> | null }) {
  const fee = caps?.maxFeeLakh ?? null;
  const yrs = caps?.maxBondYears ?? null;
  return (
    <>
      <FilterDropdown
        label="College type"
        name="ctype"
        options={typeValues.map((t) => ({ value: t, label: typeCategoryLabel[t] }))}
        selected={f.ctype ?? []}
        none="Any"
        info="Types are inferred from the name and quota, not official."
      />
      <FilterSection
        title="Fees & bond"
        none={fee != null || yrs != null ? "Your caps" : "Any"}
        info={
          <>
            A college whose figure is not published, or has no number, is left out of a fee, stipend, bond or leaving filter
            unless &quot;Include not published&quot; is ticked. &quot;No bond&quot; only lists colleges whose record says no bond (ticked, also those where a
            state law&apos;s service may still apply), and a type filter never lists a college without a type.
            <PgOr
              pg={<> &quot;None declared&quot; (a DNB hospital that declared no bond to MCC, so NBEMS lets it impose none this session) is not &quot;No bond&quot;: no document of its own says so, so it counts as not published.</>}
              other={<> A bond document Seatora has not read yet (&quot;Doc not read&quot;), one with no clear bond (&quot;Not clear&quot;) and no bond declared (&quot;None declared&quot;) count as not published.</>}
            />
          </>
        }
      >
        <TermSelect
          name="maxfee"
          label="Fee"
          value={f.maxfee}
          any={fee != null ? `Your cap: ${termValueLabel.maxfee(fee)}` : "Any fee"}
          options={[...(fee != null ? [{ value: "any", label: "Any fee" }] : []), ...choices("maxfee", num(f.maxfee))]}
        />
        <TermSelect
          name="bondyrs"
          label="Bond years"
          value={f.bondyrs}
          any={yrs != null ? `Your cap: ${termValueLabel.bondyrs(yrs)}` : "Any bond"}
          options={[...(yrs != null ? [{ value: "any", label: "Any bond" }] : []), ...choices("bondyrs", num(f.bondyrs))]}
        />
        <TermSelect name="minstip" label="Stipend" value={f.minstip} any="Any stipend" options={choices("minstip", f.minstip ?? null)} />
        <TermSelect name="maxbond" label="Bond penalty" value={f.maxbond} any="Any bond penalty" options={choices("maxbond", f.maxbond ?? null)} />
        <TermSelect name="maxleave" label="Leaving penalty" value={f.maxleave} any="Any leaving penalty" options={choices("maxleave", f.maxleave ?? null)} />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="nd" value="keep" defaultChecked={f.nd === "keep"} className="size-5 accent-sky" />
          Include not published (none declared, doc not read)
        </label>
      </FilterSection>
    </>
  );
}
