"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { baseCategories, openQuotas } from "../types";
import { BOND_YEAR_CHOICES, coursesFromPicks, feeChoices, picksOf, profileSchema, type Profile } from "../profile";
import { control } from "./ui";

export type ProfileMeta = { courses: { degree: string; specialty: string }[]; specialties: { code: string; name: string }[]; degrees: string[]; quotas: string[]; states: string[] };

const empty: Profile = { rank: 0, category: "Open", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

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

export function ProfileDialog({ open, onOpenChange, profile, meta, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; profile: Profile | null; meta: ProfileMeta; onSave: (p: Profile) => void }) {
  const [draft, setDraft] = useState<Profile>(profile ?? empty);
  const [rankText, setRankText] = useState(profile ? String(profile.rank) : "");
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [noCourse, setNoCourse] = useState(false);
  // Her courses: specialty code → ticked degrees (exact pairs); saved through coursesFromPicks.
  const [picked, setPicked] = useState(() => picksOf(profile ?? empty, meta.courses));
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

  const save = () => {
    const c = current();
    if (!c) return setNoCourse(true);
    const r = profileSchema.safeParse({ ...c, rank: Number(rankText.replace(/\D/g, "")) });
    if (!r.success) return setError("Enter your All India Rank (a number up to 3,00,000).");
    setError(null);
    onSave(r.data);
    onOpenChange(false);
  };

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

  return (
    // No Portal: rendered inside .app (DecideShell), so the dialog uses the case-sheet tokens, not the dark site's.
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-xl border border-border bg-popover p-6 shadow-overlay md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title className="text-xl font-semibold">Your rank and preferences</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">Saved on this device, and added to Decide page addresses so every screen can use it. Your rank, category, PwD status and filters appear in the address, so they travel with links you share and stay in browser history.</Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close"><X className="size-5" /></Button>
          </Dialog.Close>
        </div>

        <form className="mt-6 grid gap-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-medium">
              All India Rank
              <Input inputMode="numeric" value={rankText} onChange={(e) => setRankText(e.target.value)} placeholder="e.g. 42,284" aria-invalid={!!error} aria-describedby={error ? "profile-error" : undefined} className={`numeric ${control}`} />
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

          <Checks legend="Specialties" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} value={Object.keys(picked)} onChange={pickSpecialties} />
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
          <Checks
            legend="Quotas"
            note={`None ticked = ${openQuotas.join(", ")}, the quotas anyone can take. Tick a restricted quota (Armed Forces, NRI, minority, a university's own) only if you are eligible.`}
            options={meta.quotas.map((q) => ({ value: q, label: q }))}
            value={draft.quotas}
            onChange={(v) => set("quotas", v)}
          />
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

          {importError && <p role="alert" className="text-sm text-ember">{importError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={exportJson}>Export JSON</Button>
              <label className="inline-flex h-11 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
                Import JSON
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); }} />
              </label>
            </div>
            <Button type="submit" size="lg">Save</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
