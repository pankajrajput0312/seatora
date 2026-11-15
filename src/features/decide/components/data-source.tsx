import Link from "next/link";
import { fmtDay } from "../lib/format";
import { roundName } from "../lib/round-status";
import { listNotices } from "../server/notices";
import { seatChanges, seatLists } from "../server/seats";
import { getMeta } from "../service";
import type { DecideLinks } from "../lib/links";
import { rounds, roundLabel, type MccNotice, type SeatList, type Term } from "../types";
import { Provisional } from "./bits";
import { InfoTip } from "./info-tip";
import { RegisterSources, SourceRef, SourceRefs, type SourceDoc } from "./page-sources";
import { listTitle } from "./seats/seat-lists";
import { smallLink } from "./ui";

const noticeLinks = (ns: MccNotice[]) =>
  ns.map((n, i) => (
    <span key={n.url ?? n.title}>
      {i > 0 && "; "}
      {n.url ? (
        <a href={n.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} hover:text-sky`}>
          {n.title}, <span className="numeric ml-1">{fmtDay(n.date)}</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <>{n.title}, <span className="numeric">{fmtDay(n.date)}</span></>
      )}
    </span>
  ));

/**
 * The seat list behind a seats column or the Seats page, in one line: its PDF (numbered in the page's Sources) and,
 * behind an (i), its notice date and what "as printed" means. MCC seat notices of the round dated after the list (not
 * applied here) stay in view, in warning ink: she checks them before locking choices.
 */
export async function SeatSource({ list, L }: { list: SeatList | null; L: DecideLinks }) {
  if (!list) return null;
  const [all, notices] = await Promise.all([seatLists(), listNotices({ kind: "seat_matrix", year: list.year, round: list.round })]);
  const { later, sameDay } = seatChanges(list, all, notices);
  const noticesHref = L.to("/decide/counselling", { tab: "announcements", kind: "seat_matrix", year: list.year, round: list.round });
  const dated = list.publishedAt && `MCC notice dated ${fmtDay(list.publishedAt)}`;
  const doc: SourceDoc = { key: `seat-list|${list.key}`, name: `${list.name}, PDF${dated ? ` (${dated})` : ""}`, url: list.url, type: "OFFICIAL" };
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {/* The later and same-day notices are in the page's Sources too (the warning below stays in view). */}
      <RegisterSources docs={[...later, ...sameDay].map((n) => ({ name: `${n.title}, ${fmtDay(n.date)}`, url: n.url, type: "OFFICIAL" as const }))} />
      {/* gap-x-3: the (i)'s 44px hit area never covers the source number. */}
      <p className="flex flex-wrap items-center gap-x-3">
        <span>Seats: the {listTitle(list)} list as its PDF printed it<SourceRef doc={doc} /></span>
        <InfoTip label={`the ${listTitle(list)} list`}>
          {list.name}{dated && `, ${dated}`}. Seats MCC added or removed after it are not applied here.
          {sameDay.length > 0 && <> Published the same day as the list, so it may already include {sameDay.length === 1 ? "this notice" : "these notices"}: {noticeLinks(sameDay)}.</>}{" "}
          <Link href={noticesHref} className={`${smallLink} text-sky`}>All MCC seat notices, PG {list.year} {roundName[list.round]}</Link>
        </InfoTip>
      </p>
      {later.length > 0 && (
        <p className="text-sun">
          Check {later.length === 1 ? "this later MCC notice" : `these ${later.length} later MCC notices`} before you lock your choices: {noticeLinks(later)}
        </p>
      )}
    </div>
  );
}

type Used = { year: number; round?: string };

/**
 * Provenance for a data block in one short line, "Sources 1, 2", each number opening the page's Sources footer (AppPage)
 * at that document: the MCC allotment-result PDFs it draws on (one entry a year, a link a round, each Provisional while
 * MCC's result is: Source.provisional, also marked on the line) and the documents its fee, stipend, bond and penalty
 * texts come from. `used`: the years (all rounds) or year+round pairs shown; omit for every result PDF.
 * `results={false}` for blocks with no allotment numbers (fees only).
 */
export async function DataSource({ used, terms, results = true }: { used?: Used[]; terms?: (Term["source"] | null | undefined)[]; results?: boolean }) {
  const meta = await getMeta();
  const keys = used && new Set(used.map((u) => `${u.year}|${u.round ?? "*"}`));
  const pdfs = results ? meta.sources.filter((s) => !keys || keys.has(`${s.year}|${s.round}`) || keys.has(`${s.year}|*`)) : [];
  const years = [...new Set(pdfs.map((s) => s.year))].sort((a, b) => b - a);
  const docs: SourceDoc[] = [
    ...years.map((y) => ({
      key: `mcc-results|${y}`,
      name: `MCC allotment results, PG ${y}`,
      type: "OFFICIAL" as const,
      links: pdfs.filter((s) => s.year === y).map((s) => ({ label: roundLabel[s.round], url: s.url, title: s.name, provisional: s.provisional, order: rounds.indexOf(s.round) })),
    })),
    ...(terms ?? []).flatMap((t) => (t ? [{ name: t.name, url: t.url, type: t.type }] : [])),
  ];
  if (!docs.length) return null;
  const provisional = pdfs.filter((s) => s.provisional).sort((a, b) => b.year - a.year || rounds.indexOf(a.round) - rounds.indexOf(b.round));
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <SourceRefs docs={docs} className="" />
      {provisional.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Provisional when />
          {provisional.map((s) => `${s.year} ${roundLabel[s.round]}`).join(", ")} result
        </span>
      )}
    </div>
  );
}
