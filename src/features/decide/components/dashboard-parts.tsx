"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { typedPrefix } from "../lib/choices";
import { DEFAULT_EXAM } from "@/features/exams/keys";
import { useChoicesFor, useDecideLinks, useExam, useExamInfo, useSavedProfile } from "../lib/use-decide-store";
import { profileFromParams } from "../profile";
import { navigating } from "./nav-pending";
import { EmptyState, smallLink, StatCell } from "./ui";
import { otherGroupItems } from "../lib/choices";
import { groupsIn, quotaIn } from "@/features/exams/exam";

/**
 * The saved profile, for a page the server rendered without one (the shell then puts it into the address, and the
 * page comes again with it). If the address has it and this page is still on screen, the page is stale: a server
 * action in flight when the shell navigated (AccountSync's loadSynced, on the same hydration) makes Next discard it and
 * refresh, and that refresh can bring the old address's page after the new one. Nothing else re-renders it, so it said
 * "Loading your saved rank" for good: one refresh brings the right page.
 */
function useSavedForPrompt() {
  const [saved, , hydrated] = useSavedProfile();
  const sp = useSearchParams();
  const router = useRouter();
  const stale = hydrated && !!saved && profileFromParams(new URLSearchParams(sp.toString())) != null;
  useEffect(() => {
    if (!stale) return;
    navigating(true); // the shell keeps the refresh moving (decide-shell.tsx)
    router.refresh();
  }, [stale, router]);
  return [saved, hydrated] as const;
}

/**
 * A page that needs a profile, with none in its address: the first-run setup's start. While a saved profile is read
 * (the shell then adds it to the address) a loading line, never "set your rank" to someone who has.
 */
export function SetRankPrompt({ path }: { path: string }) {
  const [saved, hydrated] = useSavedForPrompt();
  if (!hydrated || saved) return <p role="status" className="mt-6 text-sm text-muted-foreground">Loading your saved rank and courses…</p>;
  return (
    <EmptyState
      title="Set up Decide in three steps"
      description="Rank and category, your courses, then quotas. Options then opens on this round's seats. Saved to your account, so it follows you to any device you sign in on; your rank and category show in page addresses."
      className="mt-6"
    >
      <Button asChild size="lg"><Link href={`${path}?editProfile=1`}>Set your rank</Link></Button>
    </EmptyState>
  );
}

const STEPS = ["Rank and category", "Courses", "Quotas"];

/** NEET SS with no question group in her profile (a URL rank alone): nothing is labelled until she picks it. */
export function GroupPrompt() {
  const L = useDecideLinks();
  const { label } = useExamInfo();
  return (
    <EmptyState title="Pick your question group" description={`A ${label} rank is a rank within one question group, so Seatora compares it only with that group's seats. Pick your group in your profile.`} className="mt-6">
      <Button asChild size="lg"><Link href={L.to(usePathname(), { editProfile: 1 })}>Pick your group</Link></Button>
    </EmptyState>
  );
}

/**
 * Home's first card while no rank is set: the first-run setup's three steps (the profile dialog's), "Set your rank" to
 * start it. While a saved profile is read, a loading line, as SetRankPrompt.
 */
export function SetupCard() {
  const [saved, hydrated] = useSavedForPrompt();
  const L = useDecideLinks();
  const exam = useSearchParams().get("exam");
  const steps = useExamInfo().perGroup ? ["Rank and question group", "Courses"] : STEPS;
  if (!hydrated || saved) return <p role="status" className="text-body text-muted-foreground">Loading your saved rank and courses…</p>;
  return (
    <section aria-labelledby="setup-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="setup-h" className="text-h2 font-bold">Set up Decide in {steps.length} steps</h2>
      <p className="mt-1 text-body text-muted-foreground">Options then opens on this round&apos;s seats in your courses. Saved to your account, so it follows you to any device you sign in on.</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-body">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-input font-mono text-caption font-semibold">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <Button asChild size="lg" className="mt-4 min-h-11 max-sm:w-full"><Link href={exam ? L.to("/decide", { editProfile: 1 }) : "/decide?editProfile=1"}>Set your rank</Link></Button>
    </section>
  );
}

/**
 * StatStrip cell for her active choice list (synced with the account when signed in). Neutral until localStorage is read,
 * never a false "0". `nextRound`: the choice filling she fills next ("Round 3 · 2026"), the list's name as Choices gives it.
 */
export function ChoicesStat({ nextRound }: { nextRound?: string | null }) {
  const [choices, , hydrated] = useChoicesFor(nextRound);
  const L = useDecideLinks();
  const exam = useExam();
  const list = choices.lists.find((l) => l.id === choices.activeId) ?? choices.lists[0];
  const typed = typedPrefix(list);
  return (
    <StatCell
      // Another exam's first list is named "NEET SS list" (layout.tsx): no "list list". NEET PG's labels as they were.
      label={hydrated ? `In your ${list.name}${exam === DEFAULT_EXAM || !/ list$/i.test(list.name) ? " list" : ""}` : "In your choice list"}
      value={<span className="font-mono">{hydrated ? formatRank(list.items.length) : "—"}</span>}
      note={<Link href={L.choices()} className={smallLink}>{!hydrated ? "Open your list" : typed ? `${formatRank(typed)} typed into MCC` : "None typed into MCC yet"}</Link>}
    />
  );
}

export function TopChoices({ nextRound }: { nextRound?: string | null }) {
  const [state, , hydrated] = useChoicesFor(nextRound);
  const L = useDecideLinks();
  const list = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const top = list.items.slice(0, 5);
  // NEET SS: a choice of another question group than hers is flagged (her rank isn't one there).
  const E = useExamInfo();
  const sp = useSearchParams();
  const others = new Set(otherGroupItems(top, E.perGroup ? groupsIn(E, profileFromParams(new URLSearchParams(sp.toString()))?.quotas ?? []) : []));
  return (
    <section aria-labelledby="top-choices" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="top-choices" className="text-title font-semibold">{hydrated ? `Top of ${list.name}` : "Top of your list"}</h2>
        <Link href={L.choices()} className={`${smallLink} text-sm text-sky`}>Open list</Link>
      </div>
      {!hydrated ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your list…</p>
      ) : top.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing in this list yet. Star options on <Link href={L.options()} className={`${smallLink} text-sky`}>Options</Link> to add them.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {top.map((c, i) => (
            <li key={c.id} className="flex items-baseline gap-3 py-2.5">
              <span className="numeric w-6 text-right text-sm font-bold">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.institute}</span>
                <span className="block text-xs text-muted-foreground">{c.course}, {quotaIn(E, c.quota)}</span>
                {others.has(c) && <span className="mt-0.5 block text-xs font-medium text-sun">Another question group: your rank isn&apos;t one there</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
