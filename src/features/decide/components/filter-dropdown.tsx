"use client";

import { ChevronDown } from "lucide-react";

/**
 * Compact multi-select for GET filter forms: a pill that opens a checkbox panel. Ticked boxes submit repeated params
 * (sp=A&sp=B), which every Decide page reads. Only one panel is open at a time (native `<details name>`), and it closes
 * on Escape (focus back on the pill) and when focus leaves it, so it never covers the control that has focus.
 */
export function FilterDropdown({ label, name, options, selected }: { label: string; name: string; options: { value: string; label: string }[]; selected: string[] }) {
  const count = selected.length;
  return (
    <details
      name="decide-filter"
      className="group relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false;
      }}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-card px-3 text-sm whitespace-nowrap hover:border-foreground/40 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{count ? (count === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${count} selected`) : "All"}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* tabIndex -1: a click on the panel's text keeps focus inside, so the panel stays open. */}
      <fieldset tabIndex={-1} className="absolute left-0 z-10 mt-1 max-h-80 min-w-56 overflow-auto rounded-lg border border-border bg-card p-2 shadow-overlay outline-none">
        <legend className="sr-only">{label}</legend>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 accent-sky" />
            {o.label}
          </label>
        ))}
        <p className="px-2 pt-1 text-xs text-muted-foreground">None ticked means all.</p>
      </fieldset>
    </details>
  );
}
