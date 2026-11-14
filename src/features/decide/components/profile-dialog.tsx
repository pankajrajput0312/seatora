"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { baseCategories } from "../types";
import { profileSchema, type Profile } from "../profile";

export type ProfileMeta = { specialties: { code: string; name: string }[]; degrees: string[]; quotas: string[]; states: string[]; isDemo?: boolean };

const empty: Profile = { rank: 0, category: "Open", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

function Checks({ legend, options, value, onChange }: { legend: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-muted-foreground">None ticked = all.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-secondary px-3 text-sm has-checked:border-sky">
            <input type="checkbox" className="accent-sky" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} />
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
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    const r = profileSchema.safeParse({ ...draft, rank: Number(rankText.replace(/\D/g, "")) });
    if (!r.success) return setError("Enter your All India Rank (a number up to 3,00,000).");
    setError(null);
    onSave(r.data);
    onOpenChange(false);
  };

  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    a.download = "medpath-profile.json";
    a.click();
  };
  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return setImportError("That file isn't JSON. Choose a file exported from MEDPATH.");
    }
    const r = profileSchema.safeParse(data);
    if (!r.success) return setImportError("That file isn't a MEDPATH profile.");
    setImportError(null);
    setDraft(r.data);
    setRankText(String(r.data.rank));
    setError(null);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-xl border border-border bg-popover p-6 shadow-overlay md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">Your rank and preferences</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">Saved on this device, and added to Decide page links so every screen can use it. Shared links include your rank.</Dialog.Description>
            </div>
            <Dialog.Close className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <form className="mt-6 grid gap-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm font-medium">
                All India Rank
                <Input inputMode="numeric" value={rankText} onChange={(e) => setRankText(e.target.value)} placeholder="e.g. 42,284" aria-invalid={!!error} aria-describedby={error ? "profile-error" : undefined} className="numeric h-11" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Category
                <select value={draft.category} onChange={(e) => set("category", e.target.value as Profile["category"])} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
                  {baseCategories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="accent-sky" checked={draft.pwd} onChange={(e) => set("pwd", e.target.checked)} /> PwD
              </label>
            </div>
            {error && <p id="profile-error" role="alert" className="text-sm text-ember">{error}</p>}

            <Checks legend="Specialties" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} value={draft.specialties} onChange={(v) => set("specialties", v)} />
            <Checks legend="Degrees" options={meta.degrees.map((d) => ({ value: d, label: d }))} value={draft.degrees} onChange={(v) => set("degrees", v)} />
            <Checks legend="Quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} value={draft.quotas} onChange={(v) => set("quotas", v)} />
            <Checks legend="States" options={meta.states.map((st) => ({ value: st, label: st }))} value={draft.states} onChange={(v) => set("states", v)} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Max fee per year
                <select value={draft.maxFeeLakh ?? ""} onChange={(e) => set("maxFeeLakh", e.target.value ? Number(e.target.value) : null)} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
                  <option value="">Any</option>
                  {[2, 5, 10, 20, 30, 50].map((l) => <option key={l} value={l}>Up to ₹{l} L</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Max bond
                <select value={draft.maxBondYears ?? ""} onChange={(e) => set("maxBondYears", e.target.value ? Number(e.target.value) : null)} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
                  <option value="">Any</option>
                  <option value="0">No bond</option>
                  {[1, 2, 3].map((y) => <option key={y} value={y}>Up to {y} {y === 1 ? "year" : "years"}</option>)}
                </select>
              </label>
            </div>

            {importError && <p role="alert" className="text-sm text-ember">{importError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="h-11" onClick={exportJson}>Export JSON</Button>
                <label className="inline-flex h-11 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
                  Import JSON
                  <input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
                </label>
              </div>
              <Button type="submit" size="lg">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
