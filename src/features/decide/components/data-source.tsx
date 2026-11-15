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
 * The seat lists behind a seats column or the Seats page, compact enough for a results toolbar: "As printed (i)", the
 * (i) naming each list's PDF (numbered in the page's Sources), its notice date and what "as printed" means. MCC seat
 * notices of the round dated after a list (not applied here) stay in view as one warning chip, its notices behind its
 * (i): she checks them before locking choices.
 */
export async function SeatSource({ lists, L }: { lists: SeatList[]; L: DecideLinks }) {
  if (!lists.length) return null;
  const all = await seatLists();
  const each = await Promise.all(
    lists.map(async (list) => ({ list, ...seatChanges(list, all, await listNotices({ kind: "seat_matrix", year: list.year, round: list.round })) })),
  );
  const seen = new Set<string>();
  const once = (ns: MccNotice[]) => ns.filter((n) => !seen.has(n.url ?? n.title) && !!seen.add(n.url ?? n.title));
  const later = once(each.flatMap((e) => e.later));
  const sameDay = once(each.flatMap((e) => e.sameDay));
  const { year, round } = lists[0];
  const noticesHref = L.to("/decide/counselling", { tab: "announcements", kind: "seat_matrix", year, round });
  const named = lists.length === 1 ? `the ${listTitle(lists[0])} list` : `the ${year} ${roundLabel[round]} seat lists`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {/* The later and same-day notices are in the page's Sources too. The page's own MCC documents are numbered first
          (`first`), before the term documents its rows cite. */}
      <RegisterSources first docs={[...later, ...sameDay].map((n) => ({ name: `${n.title}, ${fmtDay(n.date)}`, url: n.url, type: "OFFICIAL" as const }))} />
      <span className="inline-flex items-center gap-x-1">
        Seats as printed
        <InfoTip label={named}>
          {each.map(({ list }) => {
            const dated = list.publishedAt && `MCC notice dated ${fmtDay(list.publishedAt)}`;
            const doc: SourceDoc = { key: `seat-list|${list.key}`, name: `${list.name}, PDF${dated ? ` (${dated})` : ""}`, url: list.url, type: "OFFICIAL" };
            return (
              <span key={list.key} className="block">
                Seats: the {listTitle(list)} list as its PDF printed it<SourceRef doc={doc} first />: {list.name}{dated && `, ${dated}`}.
              </span>
            );
          })}
          Seats MCC added or removed after {lists.length === 1 ? "it" : "them"} are not applied here.
          {sameDay.length > 0 && <> Published the same day as the list, so it may already include {sameDay.length === 1 ? "this notice" : "these notices"}: {noticeLinks(sameDay)}.</>}{" "}
          <Link href={noticesHref} className={`${smallLink} text-sky`}>All MCC seat notices, PG {year} {roundName[round]}</Link>
        </InfoTip>
      </span>
      {later.length > 0 && (
        <span className="inline-flex items-center gap-x-1 rounded-full border border-sun/40 bg-sun/10 py-0.5 pl-2.5 pr-1 font-medium text-sun">
          {later.length === 1 ? "Later MCC notice: check it" : `${later.length} later MCC notices: check them`}
          <InfoTip label={later.length === 1 ? "the later MCC seat notice" : "the later MCC seat notices"}>
            Check {later.length === 1 ? "this later MCC notice" : `these ${later.length} later MCC notices`} before you lock your choices (their seats are not applied here): {noticeLinks(later)}
          </InfoTip>
        </span>
      )}
    </span>
  );
}

type Used = { year: number; round?: string };

/**
 * Provenance for a data block in one short line, "Sources 1, 2", each number opening the page's Sources footer (AppPage)
 * at that document: the MCC allotment-result PDFs it draws on (one entry a year, a link a round, each Provisional while
 * MCC's result is: Source.provisional, also marked on the line) and the documents its fee, stipend, bond and penalty
 * texts come from. `used`: the years (all rounds) or year+round pairs shown; omit for every result PDF.
 * `results={false}` for blocks with no allotment numbers (fees only). Its documents are the page's first Sources,
 * wherever on the page it sits.
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
      <SourceRefs docs={docs} first className="" />
      {provisional.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Provisional when />
          {provisional.map((s) => `${s.year} ${roundLabel[s.round]}`).join(", ")} result
        </span>
      )}
    </div>
  );
}
