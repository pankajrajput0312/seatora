"use client";

import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { baseCategories, openQuotas } from "../types";
import { BOND_YEAR_CHOICES, coursesFromPicks, feeChoices, picksOf, profileSchema, type Profile } from "../profile";
import { control } from "./ui";
import { matchesSpecialty } from "../lib/specialty-search";

export type ProfileMeta = { courses: { degree: string; specialty: string }[]; specialties: { code: string; name: string }[]; degrees: string[]; quotas: string[]; states: string[] };

const empty: Profile = { rank: 0, category: "Open", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

// The first-run setup asks these in order; everything else (states, fee, bond) is in the full editor.
const steps = ["Rank and category", "Courses", "Quotas"];

const pill = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-secondary px-3 text-sm has-checked:border-sky";

function Checks({ legend, options, value, onChange, note = "None ticked = all." }: { legend: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; note?: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={pill}>
            <input type="checkbox" className="size-4 accent-sky" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The profile editor; with `setup` (no profile yet) the guided first run: one step at a time, then Options. */
export function ProfileDialog({ open, onOpenChange, profile, meta, onSave, setup = false }: { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile | null; meta: ProfileMeta; onSave: (p: Profile) => void; setup?: boolean }) {
  const [draft, setDraft] = useState<Profile>(profile ?? empty);
  const [rankText, setRankText] = useState(profile ? String(profile.rank) : "");
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [noCourse, setNoCourse] = useState(false);
  // Her courses: specialty code → ticked degrees (exact pairs); saved through coursesFromPicks.
  const [picked, setPicked] = useState(() => picksOf(profile ?? empty, meta.courses));
  const [find, setFind] = useState("");
  const [step, setStep] = useState(0);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const rankInput = useRef<HTMLInputElement>(null);
  /** Setup: to another step; its (visually hidden) heading takes focus, so a screen reader hears where she is. */
  const go = (n: number) => {
    setStep(n);
    setTimeout(() => stepHead.current?.focus());
  };
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const offered = (s: string) => meta.courses.filter((c) => c.specialty === s).map((c) => c.degree);
  /** A newly ticked specialty: all its degrees, or the degrees she ticked before (when it has any of them). */
  const fresh = (s: string) => {
    const ds = offered(s).filter((d) => draft.degrees.includes(d));
    return ds.length ? ds : offered(s);
  };
  const pickSpecialties = (v: string[]) => setPicked((p) => Object.fromEntries(v.map((s) => [s, p[s] ?? fresh(s)])));
  const pickDegrees = (s: string, ds: string[]) => setPicked((p) => ({ ...p, [s]: offered(s).filter((d) => ds.includes(d)) }));
  // Null: specialties ticked but no degree in any, so no course; saving would mean every course (empty = all), so ask.
  const courses = coursesFromPicks(picked, draft.degrees, meta.courses);
  const current = () => courses && { ...draft, pairs: undefined, ...courses };

  const rank = () => Number(rankText.replace(/\D/g, ""));
  const rankError = "Enter your All India Rank (a number up to 3,00,000).";
  const save = () => {
    const c = current();
    if (!c) return setNoCourse(true);
    const r = profileSchema.safeParse({ ...c, rank: rank() });
    if (!r.success) return setError(rankError);
    setError(null);
    onSave(r.data);
    onOpenChange(false);
  };
  /** Setup: check this step's answer, then the next step (the last one saves). */
  const next = () => {
    if (step === 0) {
      const ok = profileSchema.shape.rank.safeParse(rank()).success;
      setError(ok ? null : rankError);
      if (!ok) return;
    }
    if (step === 1 && !courses) return setNoCourse(true);
    if (step < steps.length - 1) go(step + 1);
    else save();
  };
  const specialtyOptions = meta.specialties.filter((sp) => picked[sp.code] || matchesSpecialty(find, sp.name)).map((sp) => ({ value: sp.code, label: sp.name }));

  const exportJson = () => {
    const c = current();
    if (!c) return setNoCourse(true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }));
    a.download = "seatora-profile.json";
    a.click();
  };
  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return setImportError("That file isn't JSON. Choose a file exported from Seatora.");
    }
    const r = profileSchema.safeParse(data);
    if (!r.success) return setImportError("That file isn't a Seatora profile.");
    setImportError(null);
    setDraft(r.data);
    setPicked(picksOf(r.data, meta.courses));
    setRankText(String(r.data.rank));
    setError(null);
  };

  // The editor's parts; setup shows the first three one at a time.
  const rankStep = (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium">
          All India Rank
          <Input ref={rankInput} inputMode="numeric" value={rankText} onChange={(e) => setRankText(e.target.value)} placeholder="e.g. 42,284" aria-invalid={!!error} aria-describedby={error ? "profile-error" : undefined} className={`numeric ${control}`} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Category
          <select value={draft.category} onChange={(e) => set("category", e.target.value as Profile["category"])} className={control}>
            {baseCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-sky" checked={draft.pwd} onChange={(e) => set("pwd", e.target.checked)} /> PwD
        </label>
      </div>
      {error && <p id="profile-error" role="alert" className="text-sm text-ember">{error}</p>}
    </>
  );
  const courseStep = (
    <>
      <label className="grid gap-1.5 text-sm font-medium sm:max-w-sm">
        Find a specialty
        {/* Enter here filters, never saves or moves on. */}
        <input type="search" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} placeholder="e.g. anaes" className={control} />
      </label>
      <Checks
        legend="Specialties"
        note={setup ? "Tick each specialty you would take; then, below, untick any degree you would not. None ticked = every course." : undefined}
        options={specialtyOptions}
        value={Object.keys(picked)}
        onChange={pickSpecialties}
      />
      {find.trim() && !meta.specialties.some((sp) => matchesSpecialty(find, sp.name)) && <p role="status" className="text-sm text-muted-foreground">No specialty matches “{find.trim()}”.</p>}
      {Object.keys(picked).length ? (
        <fieldset>
          <legend className="text-sm font-medium">Degrees</legend>
          <p className="text-xs text-muted-foreground">Per specialty: untick a degree to leave that course out, e.g. keep only DNB for Family Medicine.</p>
          <div className="mt-2 grid gap-3">
            {meta.specialties.filter((s) => picked[s.code]).map((s) => {
              const all = offered(s.code);
              const ds = picked[s.code];
              return (
                <fieldset key={s.code} aria-describedby={`deg-note-${s.code}`}>
                  <legend className="text-sm">{s.name}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {all.length > 1 && (
                      <label className={pill}>
                        <input type="checkbox" className="size-4 accent-sky" checked={ds.length === all.length} ref={(el) => { if (el) el.indeterminate = ds.length > 0 && ds.length < all.length; }} onChange={() => pickDegrees(s.code, ds.length === all.length ? [] : all)} />
                        All degrees
                      </label>
                    )}
                    {all.map((d) => (
                      <label key={d} className={pill}>
                        <input type="checkbox" className="size-4 accent-sky" checked={ds.includes(d)} onChange={(e) => pickDegrees(s.code, e.target.checked ? [...ds, d] : ds.filter((x) => x !== d))} />
                        {d}
                      </label>
                    ))}
                  </div>
                  <p id={`deg-note-${s.code}`} aria-live="polite" className="mt-1 text-xs text-muted-foreground empty:hidden">
                    {!ds.length && (courses ? `No degree ticked: ${s.name} is left out.` : `No degree ticked for ${s.name}: tick one, or untick the specialty.`)}
                  </p>
                </fieldset>
              );
            })}
          </div>
          {noCourse && !courses && (
            <p role="alert" className="mt-2 text-sm text-ember">Tick at least one degree, or untick the specialties: with no course ticked, your profile would cover every course.</p>
          )}
        </fieldset>
      ) : (
        <Checks legend="Degrees" note="None ticked = all. Tick a specialty to choose its degrees." options={meta.degrees.map((d) => ({ value: d, label: d }))} value={draft.degrees} onChange={(v) => set("degrees", v)} />
      )}
    </>
  );
  const quotaStep = (
    <Checks
      legend="Quotas"
      note={`None ticked = ${openQuotas.join(", ")}, the quotas anyone can take. Tick a restricted quota (Armed Forces, NRI, minority, a university's own) only if you are eligible.`}
      options={meta.quotas.map((q) => ({ value: q, label: q }))}
      value={draft.quotas}
      onChange={(v) => set("quotas", v)}
    />
  );
  const limits = (
    <>
      <Checks legend="States" options={meta.states.map((st) => ({ value: st, label: st }))} value={draft.states} onChange={(v) => set("states", v)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Max fee per year
          <select value={draft.maxFeeLakh ?? ""} onChange={(e) => set("maxFeeLakh", e.target.value ? Number(e.target.value) : null)} className={control}>
            <option value="">Any</option>
            {feeChoices(draft.maxFeeLakh).map((l) => <option key={l} value={l}>Up to ₹{l} L</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Max bond
          <select value={draft.maxBondYears ?? ""} onChange={(e) => set("maxBondYears", e.target.value ? Number(e.target.value) : null)} className={control}>
            <option value="">Any</option>
            {BOND_YEAR_CHOICES.map((y) => <option key={y} value={y}>{y === 0 ? "No bond" : `Up to ${y} ${y === 1 ? "year" : "years"}`}</option>)}
          </select>
        </label>
      </div>
    </>
  );

  return (
    // No Portal: rendered inside .app (DecideShell), so the dialog uses the case-sheet tokens, not the dark site's.
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <Dialog.Content
        // First run: focus lands on the rank field. Editing: on the sheet itself, so a phone's keyboard doesn't cover
        // it before she picks what to change. On close the shell puts focus on the visible Edit / Set your rank button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (setup) rankInput.current?.focus();
          else (e.currentTarget as HTMLElement | null)?.focus();
        }}
        // First run: a stray tap outside would throw the steps away; Escape and Close still leave.
        onInteractOutside={(e) => setup && e.preventDefault()}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-xl border border-border bg-popover p-6 pb-0 shadow-overlay outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title className="text-xl font-semibold">{setup ? "Set up Decide" : "Your rank and preferences"}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Saved to your account. Your rank, category, PwD status and filters show in page addresses, so shared links and browser history carry them.
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close"><X className="size-5" /></Button>
          </Dialog.Close>
        </div>

        {setup && (
          <ol aria-label="Setup steps" className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {steps.map((t, i) => (
              <li key={t} aria-current={i === step ? "step" : undefined} className={cn("border-t-2 pt-1.5", i === step ? "border-sky font-semibold text-foreground" : i < step ? "border-foreground text-muted-foreground" : "border-border text-muted-foreground")}>
                <span className="numeric">{i + 1}</span> {t}{i < step && <span className="sr-only"> (done)</span>}
              </li>
            ))}
          </ol>
        )}

        <form className="mt-6 grid gap-6" onSubmit={(e) => { e.preventDefault(); if (setup) next(); else save(); }}>
          {setup && <h3 ref={stepHead} tabIndex={-1} className="sr-only">Step <span className="numeric">{step + 1}</span> of <span className="numeric">{steps.length}</span>: {steps[step]}</h3>}
          {setup ? (
            <>
              {[rankStep, courseStep, quotaStep][step]}
              {step === 2 && <p className="text-sm text-muted-foreground">States, fee and bond limits can wait: add them later with Edit, beside your rank.</p>}
            </>
          ) : (
            <>
              {rankStep}
              {courseStep}
              {quotaStep}
              {limits}
            </>
          )}

          {importError && <p role="alert" className="text-sm text-ember">{importError}</p>}
          {/* Pinned to the sheet's bottom, so Save (or Next) is always in reach however long the step. */}
          <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-popover px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pt-5">
            <div className="flex gap-2">
              {setup && step > 0 && <Button type="button" variant="secondary" onClick={() => go(step - 1)}>Back</Button>}
              {!setup && <Button type="button" variant="ghost" onClick={exportJson}>Export JSON</Button>}
              {(!setup || step === 0) && <label className="inline-flex h-11 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
                Import JSON
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); }} />
              </label>}
            </div>
            <Button type="submit" size="lg">{!setup ? "Save" : step < steps.length - 1 ? "Next" : "Save and see your options"}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
