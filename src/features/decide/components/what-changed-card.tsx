"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { scopedKey, yearName, type ExamKey } from "@/features/exams/keys";
import { badgeOf, fmtIST, roundName, stepName } from "../lib/round-status";
import { useDecideLinks, useExam, useExamInfo, useSavedProfile, useTrying } from "../lib/use-decide-store";
import { visitDiff, type VisitItem } from "../lib/visit";
import { kindName, type Round } from "../types";
import { smallLink } from "./ui";

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

export function WhatChangedCard({ items, courses }: { items: VisitItem[]; courses: Courses }) {
  const exam = useExam();
  const E = useExamInfo();
  const L = useDecideLinks();
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

  const fresh = visitDiff(base, items);
  if (!fresh?.length) return null;
  const round = (r: Round) => E.roundWords?.[r] ?? roundName[r];
  const of = <K extends VisitItem["kind"]>(k: K) => fresh.filter((i): i is Extract<VisitItem, { kind: K }> => i.kind === k);
  const [notices, steps, lists, results] = [of("notice"), of("step"), of("list"), of("result")];
  const dismiss = () => {
    endVisit(exam, keys);
    setBase(keys);
  };
  const link = (href: string | null, text: React.ReactNode, title: string) =>
    href ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>{text}<span className="sr-only">: {title} (opens in a new tab)</span></a> : text;
  const ours = courses && lists.some((l) => l.year === courses.year && l.round === courses.round);

  // A new result is the news (owner, 20 Nov): say it in one line; the notices and the rest fold under it.
  const top = results[0];
  const headline = top && `${yearName(exam, top.year)} ${round(top.round)} result is out${top.provisional ? " (provisional)" : ""}`;
  const rest = notices.length + steps.length + lists.length + Math.max(0, results.length - 1);

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
      <Fold on={!!top && rest > 0} label={`Also new since your last visit (${formatRank(rest)})`}>
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
        {results.length > (top ? 1 : 0) && (
          <div>
            <h3 className="text-sm font-semibold">{results.length === 1 ? "A new result in the data" : "New results in the data"}</h3>
            <ul className="grid gap-0.5">
              {results.slice(top ? 1 : 0).map((r) => {
                const title = `${yearName(exam, r.year)} ${round(r.round)} ${r.provisional ? "provisional" : "final"} result`;
                return <li key={r.k}>{link(r.url, title, title)}</li>;
              })}
            </ul>
            <Link href={L.options()} className={`${smallLink} text-sm text-sky`}>Your options&apos; reach, with it</Link>
          </div>
        )}
      </div>
      </Fold>
    </section>
  );
}

/** The card's other news under a disclosure when a result leads it; as before otherwise. */
function Fold({ on, label, children }: { on: boolean; label: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <details className="mt-2">
      <summary className={`${smallLink} cursor-pointer text-sm text-sky`}>{label}</summary>
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
