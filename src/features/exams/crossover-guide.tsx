import "server-only";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/features/decide/components/info-tip";
import { OpenOnHash } from "@/features/decide/components/open-on-hash";
import { smallLink } from "@/features/decide/components/ui";
import { fmtIST } from "@/features/decide/lib/round-status";
import type { Profile } from "@/features/decide/profile";
import { crossover, type CrossoverRule } from "./crossover";

/** A rule's source: the body, document, page, date and the exact words, behind an (i); the link opens the PDF. */
function Source({ r }: { r: CrossoverRule }) {
  const doc = crossover.sources[r.doc];
  return (
    <InfoTip label={`source: ${r.applies_when}`}>
      <span className="block font-semibold">{r.body === "MCC" ? "MCC" : "AIIMS New Delhi"}{r.institute ? ` (${r.institute})` : ""}: {doc?.title ?? r.doc}, page {r.page}</span>
      <span className="mt-1 block italic">&ldquo;{r.quote}&rdquo;</span>
      <a href={r.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>Open the document<span className="sr-only"> (opens in a new tab)</span></a>
    </InfoTip>
  );
}

/** An anchor of a rule or a "not stated" question (the bottom line links them). */
const anchor = (id: string) => `cx-${id}`;

function Rule({ r, profile }: { r: CrossoverRule; profile?: Profile | null }) {
  const { words, timeBound, fromJuly2026, checked } = crossover;
  // Her own deposit, from the rule's figures, when her category is known.
  const dep = r.id === crossover.depositRule && profile ? crossover.depositOf(profile.category, profile.pwd) : null;
  return (
    <li id={anchor(r.id)} tabIndex={-1} className="grid scroll-mt-20 gap-0.5 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{r.body === "MCC" ? "MCC" : r.institute ?? "AIIMS"} · {r.applies_when}</span>
      <span className="text-sm">
        {words(r.rule)} <Source r={r} />
      </span>
      {dep && (
        <span className="text-sm font-semibold">
          You ({profile!.category === "Open" ? "Open, so UR" : dep.reserved ? `${profile!.category}, so reserved` : profile!.category}): <span className="numeric">Rs {dep.aiq}</span> for AIQ; <span className="numeric">Rs {dep.deemed}</span> if you registered for Deemed Universities.
        </span>
      )}
      <span className="flex flex-wrap gap-1">
        {fromJuly2026(r) && <Badge tone="warning">From the July 2026 brochure: January 2027&apos;s is not out yet</Badge>}
        {timeBound(r) && <Badge tone="warning">As of {fmtIST(checked, true)} (MCC Notice No. 10 put Round 2 on hold)</Badge>}
      </span>
    </li>
  );
}

/**
 * INI-CET's "Also in NEET PG counselling?" guide: what each body's documents say where the two counsellings meet, in the
 * order the rules bite, each with its source; what no document states; where two documents disagree. No advice beyond
 * the documents. INI-CET's Counselling area only (staff), linked from its Home and Compare.
 */
export function CrossoverGuide({ profile }: { profile?: Profile | null }) {
  const { stages, notFound, contradictions, checked, notes, sources, words, bottomLine, over } = crossover;
  return (
    <section aria-labelledby="crossover-h" className="grid gap-3">
      <OpenOnHash />
      <div className="grid gap-1">
        <h2 id="crossover-h" className="text-lg font-semibold">Also in NEET PG counselling?</h2>
        {/* The bottom line first: each line from the rules it links, nothing beyond them. */}
        <ul aria-label="The bottom line" className="grid gap-1.5 rounded-xl border border-border bg-card p-4 text-sm">
          {bottomLine.map((l) => (
            <li key={l.text}>
              {l.text}{" "}
              <span className="text-xs text-muted-foreground">
                ({l.refs.map(([id, label], i) => <span key={id}>{i > 0 && ", "}<a href={`#${anchor(id)}`} className="text-sky underline decoration-dotted underline-offset-2">{label}</a></span>)}
                {l.july2026 && "; from the July 2026 brochure"})
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          What MCC&apos;s NEET PG 2026 documents and AIIMS&apos;s INI-CET documents say where the two counsellings meet, in the order the rules
          bite. Neither MCC nor AIIMS mentions the other&apos;s counselling, but AIIMS&apos;s rule on anyone &ldquo;pursuing&rdquo; an MD/MS at seat
          allocation covers an MD/MS from any counselling, MCC&apos;s too. State quota rules are not
          covered (each state&apos;s own bulletin has them). Checked <time dateTime={checked} className="numeric">{fmtIST(checked, true)}</time>; each rule has its source behind its (i).
        </p>
        {notes.session && <p className="text-xs text-muted-foreground">{words(notes.session)}</p>}
      </div>
      {stages.map((s, i) => (
        <details key={s.title} open={i === 0} className="rounded-xl border border-border bg-card px-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">
            <span>{i + 1}. {s.title}</span>
            <span className="numeric text-xs font-normal text-muted-foreground">{s.rules.length} {s.rules.length === 1 ? "rule" : "rules"}</span>
          </summary>
          <ol className="pb-2">{s.rules.map((r) => <Rule key={r.id} r={r} profile={profile} />)}</ol>
        </details>
      ))}
      {contradictions.length > 0 && (
        <details className="rounded-xl border border-sun/40 bg-sun/10 px-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Where two documents say it differently ({contradictions.length})</summary>
          <ul className="grid gap-2 pb-3 text-sm">
            {contradictions.map((c) => (
              <li key={c.id}>
                {words(c.text)}{" "}
                {c.rules.map((r) => <Source key={r.id} r={r} />)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {notFound.length > 0 && (
        <details className="rounded-xl border border-border bg-card px-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Not stated anywhere ({notFound.length})</summary>
          <ul className="grid gap-2 pb-3 text-sm">
            {notFound.map((n) => (
              <li key={n.id} id={anchor(n.id)} tabIndex={-1} className="grid scroll-mt-20 gap-0.5">
                <span>{n.question}</span>
                <span className="text-xs text-muted-foreground">
                  {words(n.note)} Checked in: {n.checked_in.map((d) => sources[d]?.title ?? d).join("; ")}.
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {over.length > 0 && (
        <details className="rounded-xl border border-border bg-card px-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">
            <span>Already over (as of {fmtIST(checked, true)})</span>
            <span className="numeric text-xs font-normal text-muted-foreground">{over.length} {over.length === 1 ? "rule" : "rules"}</span>
          </summary>
          <ol className="pb-2">{over.map((r) => <Rule key={r.id} r={r} />)}</ol>
        </details>
      )}
    </section>
  );
}
