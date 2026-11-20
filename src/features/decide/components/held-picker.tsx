"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { findSeats, type SeatHit } from "@/app/decide/held-actions";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { heldFromParam, heldParam, type Held } from "../lib/held";
import { roundName } from "../lib/round-status";
import { useExamInfo, useSavedProfile, useTrying } from "../lib/use-decide-store";
import type { Round } from "../types";
import { navigating, toast } from "./nav-pending";
import { control, smallLink } from "./ui";

/**
 * "I already hold a seat": search the exam's seats (any course; held-actions.ts findSeats), pick hers and the round she
 * joined it in. Saved to her profile (her account keeps it), and into the address so every page reads it; trying a
 * rank, the address only (nothing saved). `current`: her seat as the page shows it, null with none.
 */
export function HeldPicker({ current, link }: { current: { name: string; round: Round } | null; /** A text link in place of the button (Home's result card). */ link?: string }) {
  const E = useExamInfo();
  const trying = useTrying();
  const [saved, setSaved] = useSavedProfile();
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; hits: SeatHit[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [round, setRound] = useState<Round>(current?.round ?? "R1");
  const id = useId();
  const find = useRef<HTMLInputElement>(null);
  const rounds = E.rounds.filter((r) => r !== "special_stray");
  const name = (r: Round) => E.roundWords?.[r] ?? roundName[r];

  // Search as she types (a quarter second after the last key); an answer to an older query is dropped.
  useEffect(() => {
    const words = q.trim();
    if (words.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      void findSeats(words).then((r) => {
        if (!live) return;
        setFailed(!r);
        setFound(r && { q: words, ...r });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  /** Into the address (every page reads it there), and her profile unless she is trying a rank. */
  const apply = (h: Held | null) => {
    if (!trying && saved) setSaved({ ...saved, held: h ?? undefined });
    const next = new URLSearchParams(sp.toString());
    if (h) next.set("held", heldParam(h));
    else next.delete("held");
    next.delete("up");
    setOpen(false);
    toast(h ? (trying ? "Seat set for this trial" : "Saved your seat") : "Seat removed");
    navigating();
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const hits = found && found.q === q.trim() ? found : null;
  // Her seat as the address has it: "Save" with no new pick keeps it and changes the round only.
  const now = heldFromParam(sp.get("held"));
  const chosen = pick ?? (current && now && round !== now.round ? now.id : null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPick(null); setRound(current?.round ?? "R1"); } }}>
      <Dialog.Trigger asChild>
        {link ? (
          <button type="button" className={`${smallLink} text-left text-sm text-sky`}>{link}</button>
        ) : (
          <Button variant="secondary" className="shrink-0 max-sm:w-full">{current ? "Change seat" : "I already hold a seat"}</Button>
        )}
      </Dialog.Trigger>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
      {/* Focus on the search: finding her seat is the first thing to do. */}
      <Dialog.Content onOpenAutoFocus={(e) => { e.preventDefault(); find.current?.focus(); }} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border border-border bg-popover p-4 shadow-overlay outline-none sm:p-6 md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title className="text-h2 font-semibold">Your current seat</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {trying ? "For this trial only: nothing is saved." : "Saved to your profile, on every device you sign in on."} Options then pins it as Your seat and can show only the options that beat it.
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close"><X className="size-5" /></Button>
          </Dialog.Close>
        </div>
        <form className="mt-4 grid min-h-0 gap-4 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); if (chosen) apply({ id: chosen, round }); }}>
          {current && <p className="text-sm">Now: <span className="font-semibold">{current.name}</span>, joined in {name(current.round)}.</p>}
          <label className="grid gap-1 text-sm font-semibold">
            Find your seat
            <input ref={find} type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Institute, city or course, e.g. KEM pharmacology" className={control} autoComplete="off" />
          </label>
          <p role="status" className="text-sm text-muted-foreground">
            {q.trim().length < 2 ? "Type at least two letters." : failed ? "Couldn't search just now. Try again." : !hits ? "Searching…" : hits.total === 0 ? "No seat matches. Try fewer or other words." : hits.total > hits.hits.length ? `${formatRank(hits.total)} match; the first ${hits.hits.length} are below. Add a word to narrow them.` : `${formatRank(hits.total)} ${hits.total === 1 ? "seat matches" : "seats match"}.`}
          </p>
          {hits && hits.hits.length > 0 && (
            <fieldset className="grid gap-1">
              <legend className="sr-only">Seats found</legend>
              {hits.hits.map((h) => (
                <label key={h.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm has-checked:border-sky has-checked:bg-sky/10">
                  <input type="radio" name={`${id}-seat`} value={h.id} checked={pick === h.id} onChange={() => setPick(h.id)} className="mt-0.5 size-5 shrink-0 accent-sky" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{h.course}</span>
                    <span className="block">{h.college}{h.state ? `, ${h.state}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{h.quota}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <label className="grid gap-1 text-sm font-semibold">
            Round you joined it in
            <select value={round} onChange={(e) => setRound(e.target.value as Round)} className={control}>
              {rounds.map((r) => <option key={r} value={r}>{name(r)}</option>)}
            </select>
          </label>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
            {current ? <Button type="button" variant="ghost" onClick={() => apply(null)}>Remove my seat</Button> : <span />}
            <Button type="submit" disabled={!chosen}>{trying ? "Use for this trial" : "Save my seat"}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
