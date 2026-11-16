"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { matchesSpecialty } from "../lib/specialty-search";
import { FilterSection } from "./filter-form";

/**
 * A multi-select of the Filters sheet: a section (FilterSection) whose header says what is ticked, opening large
 * checkbox chips. Ticked boxes submit repeated params (sp=A&sp=B), which every Decide page reads. A long list (`search`, or more
 * than 12) has a box above it that shows only the options whose label has what she types. `none`: what the header says
 * when nothing is ticked (quotas: the open ones, not all); `info`: what that means, or how the values are arrived at,
 * behind the header's (i).
 */
export function FilterDropdown({ label, name, options, selected, none = "All", info, search }: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  selected: string[];
  none?: string;
  info?: React.ReactNode;
  search?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [ticked, setTicked] = useState(selected.length);
  const long = search || options.length > 12;
  // A long list shows what is ticked first (her profile's courses among a hundred), in the list's order otherwise.
  const shown = long ? [...options.filter((o) => selected.includes(o.value)), ...options.filter((o) => !selected.includes(o.value))] : options;
  const count = selected.length;
  const summary = count ? (count === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${count} selected`) : none;
  return (
    <FilterSection title={label} none={none} info={info} summary={summary}>
      <fieldset onChange={(e) => setTicked(e.currentTarget.querySelectorAll("input[type=checkbox]:checked").length)}>
        <legend className="sr-only">{label}</legend>
        {long && (
          // Pinned above the chips while they scroll in the sheet, so it stays above the phone's keyboard; the live count beside it.
          <div className="sticky top-0 z-[1] flex items-center gap-3 bg-card pb-2">
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              aria-label={`Find in ${label}`}
              placeholder={`Find a ${label.toLowerCase()}`}
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm"
            />
            <span aria-hidden className={cn("shrink-0 text-sm", ticked ? "font-semibold text-sky" : "text-muted-foreground")}>{ticked} selected</span>
          </div>
        )}
        {long && typed.trim() && !options.some((o) => matchesSpecialty(typed, o.label)) && <p role="status" className="py-2 text-sm text-muted-foreground">No {label.toLowerCase()} matches “{typed.trim()}”.</p>}
        {/* Large chips that wrap, as in the profile editor: more of a long list in view than one row each. */}
        <div className="flex flex-wrap gap-2">
          {shown.map((o) => (
            <label
              key={o.value}
              hidden={(long && !matchesSpecialty(typed, o.label)) || undefined}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-3 text-sm hover:border-foreground/70 has-checked:border-sky has-checked:bg-sky/10 has-checked:font-semibold has-checked:text-sky"
            >
              <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 shrink-0 accent-sky" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    </FilterSection>
  );
}
