import "server-only";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/features/decide/components/info-tip";
import { smallLink } from "@/features/decide/components/ui";
import { fmtIST } from "@/features/decide/lib/round-status";
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

function Rule({ r }: { r: CrossoverRule }) {
  const { words, timeBound, fromJuly2026, checked } = crossover;
  return (
    <li className="grid gap-0.5 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{r.body === "MCC" ? "MCC" : r.institute ?? "AIIMS"} · {r.applies_when}</span>
      <span className="text-sm">
        {words(r.rule)} <Source r={r} />
      </span>
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
export function CrossoverGuide() {
  const { stages, notFound, contradictions, checked, notes, sources, words } = crossover;
  return (
    <section aria-labelledby="crossover-h" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="crossover-h" className="text-lg font-semibold">Also in NEET PG counselling?</h2>
        <p className="text-sm text-muted-foreground">
          What MCC&apos;s NEET PG 2026 documents and AIIMS&apos;s INI-CET documents say where the two counsellings meet, in the order the rules
          bite. Neither MCC nor AIIMS mentions the other&apos;s counselling: each rule is about its own seats. State quota rules are not
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
          <ol className="pb-2">{s.rules.map((r) => <Rule key={r.id} r={r} />)}</ol>
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
              <li key={n.id} className="grid gap-0.5">
                <span>{n.question}</span>
                <span className="text-xs text-muted-foreground">
                  {words(n.note)} Checked in: {n.checked_in.map((d) => sources[d]?.title ?? d).join("; ")}.
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
