"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { scopedKey, yearName, type ExamKey } from "@/features/exams/keys";
import { badgeOf, fmtIST, roundName, stepName } from "../lib/round-status";
import { useDecideLinks, useExam, useExamInfo, useSavedProfile, useTrying } from "../lib/use-decide-store";
import { besides, visitDiff, type VisitItem } from "../lib/visit";
import { kindName, type Round } from "../types";
import { closeResultNews } from "./result-strip";
import { smallLink } from "./ui";
import { cn } from "@/lib/cn";

// "What changed since your last visit": Home remembers what it showed her (profile.seen: the profile follows her
// account when signed in, else stays in this browser) and lists what is new since. One visit (this tab, until 3 hours
// pass with no Decide page read) compares with the visit before it throughout, so Announcements marks the same notices
// "New"; Dismiss ends that. Never on a first visit; trying a rank, nothing is written.

const BASE = (exam: ExamKey) => scopedKey("decide:visit", exam);
const VISIT_MS = 3 * 3_600_000;

/** This visit's "before": the keys Home showed her last visit, kept for this tab while she keeps using Decide (null: a first visit). */
export function visitBase(exam: ExamKey, seen: string[] | null): string[] | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(BASE(exam)) ?? "null") as { at: number; base: string[] | null } | null;
    const base = s && Date.now() - s.at < VISIT_MS ? s.base : seen;
    sessionStorage.setItem(BASE(exam), JSON.stringify({ at: Date.now(), base }));
    return base;
  } catch {
    return seen; // storage blocked: her last visit as saved
  }
}
const endVisit = (exam: ExamKey, keys: string[]) => {
  try {
    sessionStorage.setItem(BASE(exam), JSON.stringify({ at: Date.now(), base: keys }));
  } catch {}
};
const same = (a: readonly string[] | undefined, b: readonly string[]) => !!a && a.length === b.length && a.every((k, i) => k === b[i]);

type Courses = { year: number; round: Round; options: number; clear: number } | null;

/** This visit's new items (null on a first visit), and Dismiss: ends them for this visit. What she sees is recorded as her next visit's "before". */
function useVisit(items: VisitItem[]) {
  const exam = useExam();
  const trying = useTrying();
  const [saved, setSaved, hydrated] = useSavedProfile();
  const [base, setBase] = useState<string[] | null>(null);
  const keys = useMemo(() => items.map((i) => i.k), [items]);

  useEffect(() => {
    if (!hydrated) return;
    setBase(visitBase(exam, saved?.seen ?? null));
    // What she sees now is her next visit's "before" (her saved profile only: trying a rank, nothing is written).
    if (!trying && saved && !same(saved.seen, keys)) setSaved({ ...saved, seen: keys });
  }, [hydrated, exam, saved, trying, keys, setSaved]);

  const dismiss = () => {
    endVisit(exam, keys);
    setBase(keys);
  };
  return { fresh: visitDiff(base, items), dismiss };
}

const link = (href: string | null, text: React.ReactNode, title: string) =>
  href ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>{text}<span className="sr-only">: {title} (opens in a new tab)</span></a> : text;

export function WhatChangedCard({ items, courses }: { items: VisitItem[]; courses: Courses }) {
  const exam = useExam();
  const E = useExamInfo();
  const L = useDecideLinks();
  const { fresh, dismiss } = useVisit(items);
  if (!fresh?.length) return null;
  const round = (r: Round) => E.roundWords?.[r] ?? roundName[r];

  // A new result is the news (owner, 20 Nov): say it in one line; the notices and the rest fold under it.
  const top = fresh.find((i): i is Extract<VisitItem, { kind: "result" }> => i.kind === "result");
  const headline = top && `${yearName(exam, top.year)} ${round(top.round)} result is out${top.provisional ? " (provisional)" : ""}`;
  const rest = fresh.filter((i) => i !== top);

  return (
    <section aria-labelledby="changed-h" className="rounded-xl border border-sky/40 bg-sky/10 p-4" data-print-hide>
      <div className="flex items-start justify-between gap-3">
        <h2 id="changed-h" className="text-title font-semibold">{headline ?? "What changed since your last visit"}</h2>
        <Button variant="ghost" size="icon" className="-mt-2 -mr-2 shrink-0" aria-label="Dismiss what changed" onClick={dismiss}><X className="size-4" aria-hidden /></Button>
      </div>
      {top && (
        <p className="mt-1 text-body">
          MCC&apos;s {round(top.round)} result is in Seatora now: your options, closing ranks and your own result include it.{" "}
          <Link href={L.options()} className={`${smallLink} text-sky`}>See your options</Link>
          {top.url && <> · {link(top.url, "MCC's result PDF", "MCC's result PDF")}</>}
        </p>
      )}
      {top ? rest.length > 0 && <Fold label={`Also new since your last visit (${formatRank(rest.length)})`} className="mt-2"><Changes items={rest} courses={courses} /></Fold> : <Changes items={rest} courses={courses} />}
    </section>
  );
}

/**
 * Home's result card (your-result.tsx, server-rendered `children`) as the round's news too: the result strip's (not shown
 * on Home) and What changed's in one card. Its ✕ shows while either is unread and closes both (the strip's cookie, this
 * visit's What changed); her result stays. Anything else new since her last visit folds under it.
 */
export function ResultNewsCard({ items, courses, round, news, title, badge, found, children, footer }: {
  items: VisitItem[];
  courses: Courses;
  /** The result the card is about: not repeated in the fold. */
  round: { year: number; round: Round };
  /** The strip's news (NEET PG), and whether she closed it (its cookie). */
  news: { id: string; closed: boolean } | null;
  title: string;
  badge: React.ReactNode;
  /** Her rank has a seat in it: the card keeps its green edge. */
  found: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { fresh, dismiss } = useVisit(items);
  const [closed, setClosed] = useState(!news || news.closed);
  const h = useRef<HTMLHeadingElement>(null);
  const more = besides(fresh ?? [], round);
  const unread = !closed || more.length > 0;
  const close = () => {
    if (news) closeResultNews(news.id);
    dismiss();
    setClosed(true);
    h.current?.focus(); // the ✕ is gone: focus stays in the card
  };
  return (
    <section aria-labelledby="your-result-h" className={cn("grid gap-2 rounded-xl border p-4 sm:p-5", unread ? "bg-sky/10" : "bg-card", found ? "border-leaf/50" : unread ? "border-sky/40" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 ref={h} id="your-result-h" tabIndex={-1} className="text-title font-semibold">{title}</h2>
          {badge}
        </div>
        {unread && (
          <Button variant="ghost" size="icon" className="-my-2 -mr-2 shrink-0" aria-label={`Mark the ${title} news as seen`} title="Mark as seen" onClick={close}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      {children}
      {more.length > 0 && <Fold label={`Also new since your last visit (${formatRank(more.length)})`}><Changes items={more} courses={courses} /></Fold>}
      {footer}
    </section>
  );
}

/** What's new, by kind: notices, schedule steps, seat lists (with her courses' options in a new list of their round), results. */
function Changes({ items, courses }: { items: VisitItem[]; courses: Courses }) {
  const exam = useExam();
  const E = useExamInfo();
  const L = useDecideLinks();
  const round = (r: Round) => E.roundWords?.[r] ?? roundName[r];
  const of = <K extends VisitItem["kind"]>(k: K) => items.filter((i): i is Extract<VisitItem, { kind: K }> => i.kind === k);
  const [notices, steps, lists, results] = [of("notice"), of("step"), of("list"), of("result")];
  const ours = courses && lists.some((l) => l.year === courses.year && l.round === courses.round);
  return (
    <div className="mt-1 grid gap-3 text-body">
      {notices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{notices.length === 1 ? "A new notice" : `${formatRank(notices.length)} new notices`}</h3>
          <ul className="grid gap-0.5">
            {notices.slice(0, 5).map((n) => (
              <li key={n.k}>
                <time dateTime={n.date} className="numeric text-muted-foreground">{fmtIST(n.date)}</time> {n.by}: {link(n.url, n.title, n.title)}
              </li>
            ))}
          </ul>
          <Link href={L.to("/decide/counselling", { tab: "announcements" })} className={`${smallLink} text-sm text-sky`}>{notices.length > 5 ? `All ${formatRank(notices.length)} in Announcements` : "Announcements"}</Link>
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Schedule</h3>
          <ul className="grid gap-0.5">
            {steps.map((s) => (
              <li key={s.k}>
                {round(s.round)} {stepName[s.step].toLowerCase()}: <span className="font-semibold">{badgeOf(s).text.toLowerCase()}</span>
                {(s.from || s.to) && <span className="numeric text-muted-foreground"> ({[s.from, s.to].filter(Boolean).map((d) => fmtIST(d!)).join(" to ")})</span>}
              </li>
            ))}
          </ul>
          <Link href={L.to("/decide/counselling")} className={`${smallLink} text-sm text-sky`}>Schedule</Link>
        </div>
      )}
      {lists.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{lists.length === 1 ? "A new seat list" : "New seat lists"}</h3>
          <ul className="grid gap-0.5">
            {lists.map((l) => {
              const title = `${yearName(exam, l.year)} ${round(l.round)} ${kindName(l.list, exam).toLowerCase()}${kindName(l.list, exam) === "Seat position" ? "" : " list"}`;
              return <li key={l.k}>{link(l.url, title, title)}{l.date && <span className="numeric text-muted-foreground"> ({fmtIST(l.date)})</span>}</li>;
            })}
          </ul>
          {ours && (
            <p>
              In your courses: <span className="numeric font-semibold">{formatRank(courses.options)}</span> {courses.options === 1 ? "option has" : "options have"} seats in {round(courses.round)}&apos;s lists
              {courses.clear !== courses.options && <>, <span className="numeric font-semibold">{formatRank(courses.clear)}</span> in the clear vacancy list</>}.{" "}
              <Link href={L.options()} className={`${smallLink} text-sky`}>See them on Options</Link>
            </p>
          )}
        </div>
      )}
      {results.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{results.length === 1 ? "A new result in the data" : "New results in the data"}</h3>
          <ul className="grid gap-0.5">
            {results.map((r) => {
              const title = `${yearName(exam, r.year)} ${round(r.round)} ${r.provisional ? "provisional" : "final"} result`;
              return <li key={r.k}>{link(r.url, title, title)}</li>;
            })}
          </ul>
          <Link href={L.options()} className={`${smallLink} text-sm text-sky`}>Your options&apos; reach, with it</Link>
        </div>
      )}
    </div>
  );
}

/** The other news under a disclosure. */
function Fold({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <details className={cn("group", className)}>
      <summary className={`${smallLink} cursor-pointer text-sm text-sky`}>
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        {label}
      </summary>
      {children}
    </details>
  );
}

/** Announcements: "New" beside a notice she hadn't seen at her last visit (this visit's "before", as Home's card). */
export function NewMark({ k }: { k: string }) {
  const exam = useExam();
  const [saved, , hydrated] = useSavedProfile();
  const [base, setBase] = useState<string[] | null>(null);
  useEffect(() => {
    if (hydrated) setBase(visitBase(exam, saved?.seen ?? null));
  }, [hydrated, exam, saved?.seen]);
  return base && !base.includes(k) ? <Badge tone="info">New</Badge> : null;
}
