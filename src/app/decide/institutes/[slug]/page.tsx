import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, HISTORY_CAPTION, PageHead, Provisional, ReachBadge } from "@/features/decide/components/bits";
import { FeesSection, programmeTitle, termDocs, TermsSummary } from "@/features/decide/components/fees";
import { ChoiceStar, CompareToggle } from "@/features/decide/components/option-actions";
import { HideableRow } from "@/features/decide/components/residents/hideable-row";
import { Rank, ResidentsSources } from "@/features/decide/components/residents-results";
import { reportedCount, TypeBadge } from "@/features/decide/components/institute/hospital-bits";
import { allotmentMixAt, clinicalAt, headerLists, hospitalInfo, optionSeats, roundSeatsAt, roundSeatTotals, websiteUrl } from "@/features/decide/components/institute/institute-data";
import { AllotmentMixTable, CategoryToggle, CollegeSeatTable, HospitalFacts, RoundSeatsHead, SeatNumber } from "@/features/decide/components/institute/institute-parts";
import { courseName, RoundGrid, SeatsBelowNote, toChoiceItem } from "@/features/decide/components/options-view";
import { listTitle, seatKindNote, UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, StatStrip, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getInstitute, getMeta, LATEST_YEAR, listAllotments, optionsView, PAST_YEARS, renamedCollege } from "@/features/decide/service";
import { feesFor } from "@/features/decide/server/facts";
import { programmes } from "@/features/decide/server/terms";
import { canSeeResidents, groupResidents, listResidents, residentsBudget } from "@/features/decide/server/residents";
import { roundLabel, seatKindLabel } from "@/features/decide/types";
import { hideResidentAction } from "./actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const tabs = [
  { key: "overview", label: "Overview" },
  { key: "courses", label: "Courses" },
  { key: "seats", label: "Seats" },
  { key: "fees", label: "Fees & bond" },
  { key: "clinical", label: "Hospital facts" },
  { key: "allotments", label: "Allotments" },
  { key: "residents", label: "Residents" },
] as const;
const PAGE_SIZE = 50;
const schema = z.object({
  tab: z.enum(["overview", "courses", "seats", "allotments", "fees", "clinical", "residents"]).default("overview"),
  /** Courses tab seat columns: every seat category instead of hers (as Seats' `scat=all`). */
  scat: z.literal("all").optional(),
  year: z.coerce.number().int().optional(),
  course: z.string().max(100).optional(),
  page: pageValue.default(1),
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const college = await getCollege((await params).slug).catch((e) => {
    unstable_rethrow(e);
    return null;
  });
  const { tab } = parseSearchParams(schema, toURLSearchParams(await searchParams));
  // People's names: never indexed.
  const robots = tab === "residents" ? { index: false, follow: false } : undefined;
  // The tab is in the title, so switching tabs is announced (Next's route announcer reads the title).
  return { title: `${tabs.find((t) => t.key === tab)!.label} · ${college?.name ?? "Institute"}`, robots };
}

export default async function InstitutePage({ params, searchParams }: Props) {
  const sp = toURLSearchParams(await searchParams);
  const profile = profileFromParams(sp);
  const L = decideLinks(sp);
  const slug = (await params).slug;
  const f = parseSearchParams(schema, sp);
  const [inst, meta] = await Promise.all([getInstitute(slug, profile), getMeta()]);
  if (!inst) {
    // A slug of a college key an MCC import retired (merged, or a neutral name): 308 to the college it became.
    const to = await renamedCollege(slug);
    if (to) permanentRedirect(`/decide/institutes/${to.slug}${sp.size ? `?${sp}` : ""}`);
    notFound();
  }
  const { college, options, yours, allotmentsByYear, fees, unlistedBy } = inst;
  const tab = f.tab;
  const yearInfo = (y: number) => meta.years.find((x) => x.year === y);
  const maxN = Math.max(1, ...allotmentsByYear.map((a) => a.n ?? 0));
  const courses = [...new Map(options.map((o) => [o.course.slug, o.course])).values()];
  const listed = profile ? yours : options;
  const allotYear = yearInfo(f.year ?? 0)?.year;
  const allotCourse = courses.find((c) => c.slug === f.course)?.slug;

  const n2025 = allotmentsByYear.find((a) => a.year === PAST_YEARS[1])?.n ?? null;
  const nLatest = allotmentsByYear.find((a) => a.year === LATEST_YEAR)?.n ?? null;

  // Allotments tab: one page from SQL; a page past the end shows the last page.
  const allot = tab === "allotments" ? await listAllotments({ year: allotYear, course: allotCourse }, { page: f.page, pageSize: PAGE_SIZE }, college.key) : null;
  // ponytail: every row on one page (largest institute ~930 rows, ~1.6 MB HTML); add a course filter if that grows.
  const residentsAccess = tab !== "residents" ? null : !(await canSeeResidents()) ? "locked" : !(await residentsBudget("read")) ? "limited" : "ok";
  const residents = residentsAccess === "ok" ? await listResidents(college.key) : null;
  const residentGroups = residents ? groupResidents(residents.rows, profile) : [];
  const residentYears = [...new Set(residents?.rows.map((r) => r.year))].sort((a, b) => b - a);
  // Seats here with no past allotments: not in the lists below; Seats shows them, and while Options opens in the round
  // view, Options lists those in her profile as new options (search: this institute's name, within its 100 characters).
  const newOnOptions = profile && optionsView(undefined, inst.seatList ? [inst.seatList] : [], meta.sources) === "round" ? L.options({ reach: "new", q: college.name.slice(0, 100) }) : undefined;
  // One note per list of the round with such seats (clear, virtual, newly added: they overlap, so never added).
  const unlisted = unlistedBy.filter((u) => u.seats > 0);
  const unlistedNote = unlisted.length > 0 && (
    <div className="grid gap-1">
      {unlisted.map((u) => <UnlistedSeats key={u.list.key} u={u} profile={!!profile} here href={L.to("/decide/seats", { view: "list", list: u.list.key, inst: slug, nohist: "1" })} options={newOnOptions} />)}
    </div>
  );
  // The newest round's seat lists here (Courses columns, Seats tab), each separate; the header's totals from them there,
  // else from one grouped sum; allotments by quota and seat category (Overview).
  // Fees tab: the fee table by seat-type group per programme (none for MCh, MPH); Hospital facts tab: clinical facts.
  const listsTab = tab === "courses" || tab === "seats";
  const [round, totals, mix, info, feeGroups, clinical] = await Promise.all([
    listsTab ? roundSeatsAt(college.key) : [],
    listsTab ? null : roundSeatTotals(college.key),
    tab === "overview" ? allotmentMixAt(college.key) : null,
    hospitalInfo().then((m) => m.get(college.key) ?? null),
    tab === "fees" ? Promise.all(fees.map((p) => feesFor(college.key, p.programme))) : [],
    tab === "clinical" ? clinicalAt(college.key, profile) : null,
  ]);
  const website = websiteUrl(info?.website ?? null);
  const roundLists = round.map((x) => x.list);
  const roundName = round[0] && `${round[0].list.year} ${roundLabel[round[0].list.round]}`;
  const mine = profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const seatCats = mine && f.scat !== "all" ? mine : undefined;
  const beds = info?.beds ? { ...reportedCount(info.beds), period: info.beds.meta?.period } : null;
  // Header: this round's clear and virtual vacancies here (the newest PDF of each kind); the lists overlap, so never added.
  const roundSeats = totals ?? headerLists(round.map((r) => r.list)).map((list) => ({ list, n: round.find((r) => r.list === list)!.rows.reduce((a, r) => a + r.seats, 0) }));

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      {/* A div: globals.css hides every <header> on paper (the app bar), and this one holds the name and address. */}
      <div className="grid gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={L.institutes()} className={smallLink}>Institutes</Link>
            {college.state && <> / <Link href={L.institutes({ state: college.state })} className={smallLink}>{college.state}</Link></>}
          </p>
          <PageHead title={college.name} />
          <p className="mt-2 flex flex-wrap items-center gap-x-4 text-sm">
            {college.state && <span className="font-medium">{college.state}</span>}
            {info?.type && <TypeBadge type={info.type} note />}
            {info?.mccProfileUrl && (
              <a href={info.mccProfileUrl} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>Official MCC profile<span className="sr-only"> (opens in a new tab)</span></a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>
                Website<span className="sr-only">: {info!.website}, as declared on its MCC profile (opens in a new tab)</span>
              </a>
            )}
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Address as printed by MCC: {college.address ?? <Dash />}</p>
        </div>
        <dl aria-label="Key numbers" className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Beds, as reported</dt>
            <dd className="text-2xl font-bold">
              {beds ? (
                <Link href={L.institute(slug, "clinical")} className="numeric inline-flex min-h-11 items-center text-sky hover:underline">{beds.text}<span className="sr-only"> beds: see Hospital facts</span></Link>
              ) : (
                <Dash />
              )}
            </dd>
            <dd className="text-xs text-muted-foreground">{beds ? `Self-reported${beds.period ? `, ${beds.period}` : ""}` : "Not found yet"}</dd>
            {beds?.conflicting && <dd className="text-xs text-sun">The source prints conflicting figures</dd>}
          </div>
          {roundSeats.map(({ list, n }) => (
            <div key={list.key}>
              <dt className="text-sm text-muted-foreground">{list.year} {roundLabel[list.round]} {seatKindLabel[list.kind].toLowerCase()}</dt>
              <dd className="text-2xl font-bold">
                <Link href={L.to(`/decide/institutes/${slug}`, { tab: "seats" })} className="numeric inline-flex min-h-11 items-center text-sky hover:underline">
                  {n > 0 ? `${formatRank(n)} ${n === 1 ? "seat" : "seats"}` : "None"}<span className="sr-only">: see Seats</span>
                </Link>
              </dd>
              <dd className="text-xs text-muted-foreground">{n > 0 ? (list.kind === "virtual" ? "Free only if the holder upgrades or leaves" : "Every course, quota and category here") : "The MCC list prints none here"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <SubTabs label="Institute sections" current={tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: L.to(`/decide/institutes/${slug}`, { tab: t.key }) }))} />

      {tab === "overview" && (
        <>
          <StatStrip
            items={[
              { label: "Courses here", value: formatRank(courses.length) },
              { label: "Course and quota options", value: formatRank(options.length) },
              { label: `Allotments in ${PAST_YEARS[1]}`, value: n2025 != null ? formatRank(n2025) : <Dash />, note: "All rounds and seat categories; not seats" },
              // Four cells fill the strip: hers when she has a profile, else the latest year's allotments.
              profile
                ? { label: "In your profile", value: formatRank(yours.length), note: "Your courses, quotas, states and caps" }
                : { label: `Allotments in ${yearInfo(LATEST_YEAR)?.label ?? LATEST_YEAR}`, value: nLatest != null ? formatRank(nLatest) : <Dash />, note: "All seat categories; not seats" },
            ]}
          />

          <section aria-labelledby="yours" className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="yours" className="text-lg font-semibold">{profile ? "Your options here" : "Courses and quotas here"}</h2>
              <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sm text-sky`}>All course details</Link>
            </div>
            {unlistedNote && <div className="mt-2">{unlistedNote}</div>}
            {listed.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {profile ? "None of the courses and quotas with past allotments here match your profile." : "No courses with past allotments here."}{" "}
                {options.length > 0 && <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sky`}>See every course here</Link>}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {listed.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium">{courseName(o)}</span> <span className="text-sm text-muted-foreground">{o.quota}</span>
                      <span className="flex gap-4 text-sm">
                        <Link href={L.lastRanks(o.course.slug, { inst: slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
                        <Link href={L.institute(slug, "allotments", { course: o.course.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      {profile && <ReachBadge reach={o.reach} provisional={o.reachProvisional} />}
                      <span className="text-right"><span className="block text-xs text-muted-foreground">{PAST_YEARS[1]} deepest</span><Closing d={o.byYear[PAST_YEARS[1]]} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{HISTORY_CAPTION}{!profile && " Closing ranks shown across all seat categories."}</p>
          </section>

          <section aria-labelledby="terms-h" className="grid gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="terms-h" className="text-lg font-semibold">Fees, stipend and bond</h2>
              <Link href={L.institute(slug, "fees")} className={`${smallLink} text-sm text-sky`}>Year by year, sources</Link>
            </div>
            {fees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses here in the MCC data, so no programme to show fees for.</p>
            ) : (
              <ul className="divide-y divide-border">
                {fees.map((p) => <li key={p.programme} className="py-2"><TermsSummary t={p} programme /></li>)}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Year 1 figures, from what the college declared to MCC and NBEMS rules. &quot;Not declared&quot; means not in the MCC profile fields Seatora imports, not &quot;none&quot;.
              Bond and leaving: a range when the amount depends on course type; &quot;computed&quot; marks a per-year amount × the years. Each figure is numbered to its document on the Fees &amp; bond tab.
            </p>
            <DataSource terms={termDocs(fees)} results={false} />
          </section>

          <section aria-labelledby="trend" className="rounded-xl border border-border bg-card p-5">
            <h2 id="trend" className="text-lg font-semibold">Allotments made by year</h2>
            <p className="mt-1 text-sm text-muted-foreground">All courses, rounds and seat categories here. This counts allotments, not seats.</p>
            <table className="mt-4 w-full max-w-xl text-sm">
              <caption className="sr-only">Allotments made by year at {college.name}</caption>
              <tbody>
                {allotmentsByYear.map((a) => (
                  <tr key={a.year}>
                    <th scope="row" className="w-48 py-1.5 text-left font-normal text-muted-foreground">{yearInfo(a.year)?.label ?? a.year}</th>
                    <td className="py-1.5">{a.n != null && <div className="h-3 rounded-r-[4px] bg-mark" style={{ width: `${(a.n / maxN) * 100}%` }} aria-hidden />}</td>
                    <td className="numeric w-16 py-1.5 text-right font-semibold">{a.n != null ? formatRank(a.n) : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="mix-h" className="grid gap-3 rounded-xl border border-border bg-card p-5">
            <h2 id="mix-h" className="text-lg font-semibold">Allotments by quota and seat category</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              All courses here, from MCC&apos;s allotment results: the latest round, then each year with all its rounds. These count allotments (in R2 and later rounds, only fresh
              and upgraded ones), not seats. The seat category is the seat&apos;s, not the candidate&apos;s.
            </p>
            {mix ? <AllotmentMixTable mix={mix} name={college.name} /> : <p className="text-sm text-muted-foreground">No MCC allotments here in the imported results.</p>}
          </section>
          <DataSource used={[...PAST_YEARS.map((year) => ({ year })), { year: LATEST_YEAR }, ...(mix?.columns.map((c) => ({ year: c.year, round: c.round })) ?? [])]} />
        </>
      )}

      {tab === "courses" && (
        <section aria-labelledby="courses-h" className="grid grid-cols-1 gap-3">
          <h2 id="courses-h" className="sr-only">Courses</h2>
          {unlistedNote}
          {mine && round.length > 0 && options.length > 0 && (
            <CategoryToggle mine={mine} all={!seatCats} href={(all) => L.with(`/decide/institutes/${slug}`, { scat: all ? "all" : null })} />
          )}
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses with past MCC allotments here, so there are no closing ranks to show.</p>
          ) : (
            <div role="region" aria-label="Courses offered" tabIndex={0} className={tbl.wrap}>
              <table className={tbl.table}>
                <caption className="sr-only">Courses at {college.name}, with past closing ranks</caption>
                <thead>
                  <tr className={tbl.headRow}>
                    <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Add to choices</span></th>
                    <th scope="col" className={tbl.th}>Course and quota</th>
                    <th scope="col" className={tbl.th}>{profile ? "Your reach" : "Reach"}</th>
                    {roundLists.map((l) => <th key={l.key} scope="col" className={`${tbl.th} text-right`}><RoundSeatsHead list={l} lists={roundLists} /></th>)}
                    <th scope="col" className={`${tbl.th} text-right`}>{LATEST_YEAR} R1</th>
                    <th scope="col" className={`${tbl.th} text-right`}>{PAST_YEARS[1]} deepest</th>
                    <th scope="col" className={tbl.th}>Related</th>
                    <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Compare</span></th>
                  </tr>
                </thead>
                <tbody>
                  {options.flatMap((r) => [
                    <tr key={r.id} className={`expand-host ${tbl.row}`}>
                      {/* Without a rank the reach is unknown, so nothing would be saved with the choice: star only with a profile. */}
                      <td className="px-2 py-2">{profile && <ChoiceStar item={toChoiceItem(r)} />}</td>
                      <th scope="row" className={`${tbl.td} text-left font-medium`}>{courseName(r)}<span className="block text-xs font-normal text-muted-foreground">{r.quota}</span></th>
                      <td className={tbl.td}>{profile ? <><ReachBadge reach={r.reach} provisional={r.reachProvisional} /><SeatsBelowNote r={r} /></> : <span className="text-xs text-muted-foreground">Set your rank to see</span>}</td>
                      {round.map(({ list, rows }) => (
                        <td key={list.key} className={`${tbl.td} text-right`}>
                          <SeatNumber
                            n={optionSeats(rows, { ...r.course, quota: r.quota }, seatCats)}
                            href={L.to("/decide/seats", { view: "list", list: list.key, inst: slug, course: r.course.slug, squota: r.quota, scat: mine && !seatCats ? "all" : undefined })}
                            label={`seats in the ${listTitle(list)} list, ${seatCats ? "your seat categories" : "every seat category"}: ${college.name}, ${courseName(r)}, ${r.quota}`}
                          />
                        </td>
                      ))}
                      <td className={tbl.num}>
                        <Closing d={r.latest} />
                        {/* ReachBadge already carries the marker for "Reached in R1". */}
                        <Provisional when={r.latest?.provisional && !(profile && r.reachProvisional)} />
                      </td>
                      <td className={tbl.num}><Closing d={r.byYear[PAST_YEARS[1]]} /></td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <details><summary className="cursor-pointer py-3 text-sky">Rounds by year</summary></details>
                        <span className="flex gap-x-3">
                          <Link href={L.lastRanks(r.course.slug, { inst: slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
                          <Link href={L.institute(slug, "allotments", { course: r.course.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
                        </span>
                      </td>
                      <td className="px-2 py-2"><CompareToggle id={r.id} label={`${college.name}, ${courseName(r)}, ${r.quota}`} /></td>
                    </tr>,
                    <tr key={`${r.id}-rounds`} className="expand-row bg-muted/30">
                      <td />
                      <td colSpan={6 + round.length} className="px-4 pb-4"><RoundGrid row={r} caption={`${courseName(r)}, ${r.quota}: closing ranks by year and round`} /></td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {HISTORY_CAPTION}{profile ? " Closing ranks are on the seat categories you can take." : " Closing ranks shown across all seat categories."}
            {roundName &&
              ` ${roundName} seats: in each of MCC's ${roundName} lists (${[...new Set(roundLists.map((l) => seatKindLabel[l.kind].toLowerCase()))].join(", ")}), that quota and ${seatCats ? "your seat categories" : "every seat category"}; "—" when a list has none. The lists overlap, so their seats are never added together. Each number opens those seats on Seats.`}
          </p>
          <DataSource />
          {roundLists.map((l) => <SeatSource key={l.key} list={l} L={L} />)}
        </section>
      )}

      {tab === "seats" &&
        (round.length === 0 ? (
          <EmptyState title="Seat lists not imported yet" description="No MCC seat list is in the data yet, so there are no seats to show here." href={L.institute(slug, "courses")} action="See the courses here" />
        ) : (
          <section aria-labelledby="seats-h" className="grid grid-cols-1 gap-8">
            <div className="grid gap-2">
              <h2 id="seats-h" className="text-lg font-semibold">{roundName} seat lists at this institute</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Every course here, each list as its MCC PDF printed it. The kinds of list overlap (most newly added seats are also clear vacancies), so their seats are never added together.
              </p>
            </div>
            {round.map(({ list, rows }, i) => {
              const n = rows.reduce((a, r) => a + r.seats, 0);
              return (
                <section key={list.key} aria-labelledby={`seats-${i}`} className="grid gap-3">
                  <h3 id={`seats-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                    {seatKindLabel[list.kind]}
                    {rows.length > 0 && <span className="numeric text-sm font-normal text-muted-foreground">{formatRank(n)} {n === 1 ? "seat" : "seats"} here</span>}
                  </h3>
                  <p className="max-w-3xl text-sm text-muted-foreground first-letter:uppercase">{seatKindNote[list.kind]}</p>
                  <SeatSource list={list} L={L} />
                  {rows.length > 0 ? (
                    <CollegeSeatTable rows={rows} caption={`${listTitle(list)} seats at ${college.name} (MCC PDF), by course`} />
                  ) : (
                    <p className="text-sm text-muted-foreground">This list prints no seats at this institute.</p>
                  )}
                </section>
              );
            })}
          </section>
        ))}

      {tab === "allotments" && allot && (
        <section aria-labelledby="allot-h" className="grid grid-cols-1 gap-4">
          <h2 id="allot-h" className="sr-only">Allotments</h2>
          <FilterBar action={`/decide/institutes/${slug}`} params={sp} cols="md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="tab" value="allotments" />
            <Field label="Year"><Select name="year" value={allotYear ? String(allotYear) : undefined} all="All years" options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
            <Field label="Course"><Select name="course" value={allotCourse} all="All courses" options={courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
          </FilterBar>
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            <span className="numeric font-semibold text-foreground">{rangeLabel(allot)}</span> allotments at this institute, newest first. Ranks only, never names.{" "}
            <Link href={L.allotments({ inst: slug, course: allotCourse, year: allotYear })} className={`${smallLink} text-sky`}>Open in Allotments, with fees and more filters</Link>
          </p>
          {allot.total === 0 ? (
            <EmptyState title="No allotments match these filters." href={L.institute(slug, "allotments")} />
          ) : (
            <div role="region" aria-label="Allotments at this institute" tabIndex={0} className={tbl.wrap}>
              <table className={tbl.table}>
                <caption className="sr-only">Allotments at {college.name}</caption>
                <thead><tr className={tbl.headRow}>
                  <th scope="col" className={`${tbl.th} text-right`}>Rank</th><th scope="col" className={tbl.th}>Year and round</th><th scope="col" className={tbl.th}>Course</th><th scope="col" className={tbl.th}>Quota</th><th scope="col" className={tbl.th}>Seat category</th><th scope="col" className={tbl.th}>Remark</th>
                </tr></thead>
                <tbody>
                  {allot.rows.map((a, i) => (
                    <tr key={i} className={tbl.row}>
                      <td className={tbl.num}><Link href={L.rankScan(a.rank, a.year)} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link></td>
                      <td className={`${tbl.td} whitespace-nowrap`}><span className="numeric">{a.year}</span> {roundLabel[a.round]} <Provisional when={a.provisional} /></td>
                      <td className={tbl.td}><Link href={L.lastRanks(a.courseSlug, { inst: slug })} className="hover:text-sky hover:underline">{a.courseName}</Link></td>
                      <td className={tbl.td}>{a.quota}</td>
                      <td className={tbl.td}>{a.category}</td>
                      <td className={`${tbl.td} text-muted-foreground`}>{a.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={allot.page} pageSize={PAGE_SIZE} total={allot.total} href={(n) => L.page(`/decide/institutes/${slug}`, n)} focusId="results" label="Allotments" />
          <p className="text-xs text-muted-foreground">Select a rank to scan the allotments around it that year.</p>
          <DataSource used={[...new Map(allot.rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]} />
        </section>
      )}

      {tab === "fees" && (
        <section aria-labelledby="fees-h" className="grid grid-cols-1 gap-4">
          <h2 id="fees-h" className="sr-only">Fees, stipend and bond</h2>
          {fees.length === 0 ? (
            <EmptyState title="No courses here in the MCC data" description="There is no programme here to show fees, stipend or bond for." href={L.institute(slug, "courses")} action="See the courses here" />
          ) : (
            <>
              {fees.length > 1 && (
                <nav aria-label="Programmes here" className="flex flex-wrap gap-x-4 text-sm">
                  {fees.map((p) => <a key={p.programme} href={`#fees-${programmes[p.programme].slug}`} className={`${smallLink} text-sky`}>{programmeTitle(p)}</a>)}
                </nav>
              )}
              {fees.map((p, i) => (
                <div key={p.programme} className="rounded-xl border border-border bg-card p-5">
                  <FeesSection t={p} groups={feeGroups[i]} id={`fees-${programmes[p.programme].slug}`} />
                </div>
              ))}
            </>
          )}
          <p className="max-w-3xl text-xs text-muted-foreground">
            One section per programme offered here ({fees.map(programmeTitle).join(", ") || "none"}), by seat type (All India, Deemed/Paid, NRI, DNB Quota) where the MCC profile gives them. Fee that year and stipend per month as declared to MCC; where the profile&apos;s fee is not one clearly labelled amount per year, its own words with their link instead, never a figure. NBEMS maximum and minimum are NBEMS&apos;s limits, not the college&apos;s figures. A dash means not stated (not in the MCC profile fields we import; the profile may say more), never zero.
            Leaving the course after joining is the college&apos;s or state&apos;s penalty from its bond document; resigning from Round 2 is MCC&apos;s separate forfeit.
          </p>
          {college.state && <p className="text-sm"><Link href={L.fees({ state: college.state })} className={`${smallLink} text-sky`}>Compare fees with other institutes in {college.state}</Link></p>}
        </section>
      )}

      {tab === "clinical" &&
        (clinical ? (
          <HospitalFacts f={clinical} name={college.name} />
        ) : (
          <EmptyState
            title="No hospital facts found yet"
            description="Seatora has found no beds, patient numbers or facilities published by this institute, and no NBEMS mandatory disclosure check for it."
            href={L.institute(slug, "courses")}
            action="See the courses here"
          />
        ))}
      {residentsAccess === "locked" && (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {residentsAccess === "limited" && (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network or account. Try again in an hour, or tomorrow." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {tab === "residents" && residents && (
        <section aria-labelledby="res-h" className="grid grid-cols-1 gap-4">
          <h2 id="res-h" className="sr-only">Residents</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            From MCC&apos;s official admitted-candidates lists. Shown for choosing a college — contact people respectfully; ask to be hidden and we will.
          </p>
          {residents.total === 0 ? (
            <EmptyState title="No residents listed here" description="MCC's admitted-candidates lists have no names at this institute, or they were hidden." href={L.institute(slug, "courses")} action="See the courses here" />
          ) : (
            <>
              <div role="region" aria-label="Residents by course and year" tabIndex={0} className={tbl.wrap}>
                <table className={tbl.table}>
                  <caption className="sr-only">Residents at {college.name} by course and year</caption>
                  <thead><tr className={tbl.headRow}>
                    <th scope="col" className={tbl.th}>Course</th>
                    {residentYears.map((y) => <th key={y} scope="col" className={`${tbl.th} text-right`}>{y}</th>)}
                    <th scope="col" className={`${tbl.th} text-right`}>Total</th>
                  </tr></thead>
                  <tbody>
                    {residentGroups.map((g) => (
                      <tr key={g.course.slug} className={tbl.row}>
                        <th scope="row" className={`${tbl.td} text-left font-medium`}><a href={`#res-${g.course.slug}`} className="hover:text-sky hover:underline">{g.course.degree} {g.course.name}</a></th>
                        {residentYears.map((y) => {
                          const n = g.years.find((x) => x.year === y)?.rows.length;
                          return <td key={y} className={tbl.num}>{n ? formatRank(n) : <Dash />}</td>;
                        })}
                        <td className={tbl.num}>{formatRank(g.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {residentGroups.map((g) => (
                <section key={g.course.slug} aria-labelledby={`res-${g.course.slug}`} className="grid gap-2">
                  <h3 id={`res-${g.course.slug}`} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {g.course.degree} {g.course.name} <span className="numeric text-sm font-normal text-muted-foreground">{formatRank(g.total)}</span>
                    {profile && g.mine && <Badge tone="info">In your profile</Badge>}
                  </h3>
                  <div role="region" aria-label={`Residents, ${g.course.degree} ${g.course.name}`} tabIndex={0} className={tbl.wrap}>
                    <table className={tbl.table}>
                      <caption className="sr-only">Residents in {g.course.degree} {g.course.name} at {college.name}, newest year first</caption>
                      <thead><tr className={tbl.headRow}>
                        <th scope="col" className={tbl.th}>Name</th><th scope="col" className={tbl.th}>Year</th><th scope="col" className={tbl.th}>MCC list</th>
                        <th scope="col" className={`${tbl.th} text-right`}>Rank</th><th scope="col" className={tbl.th}><span className="sr-only">Hide</span></th>
                      </tr></thead>
                      {g.years.map((y) => (
                        <tbody key={y.year}>
                          <tr className="border-b border-border bg-muted/40"><th scope="rowgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground"><span className="numeric">{y.year}</span> · {formatRank(y.rows.length)}</th></tr>
                          {y.rows.map((r) => (
                            <HideableRow key={r.id} id={r.id} name={r.name} hide={hideResidentAction} colSpan={5} className={tbl.row}>
                              <th scope="row" className={`${tbl.td} text-left font-medium`}>{r.name}</th>
                              <td className={`${tbl.td} numeric`}>{r.year}</td>
                              <td className={tbl.td}>{r.list}</td>
                              <td className={tbl.num}><Rank rank={r.rank} year={r.year} /></td>
                            </HideableRow>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </section>
              ))}
              <p className="text-xs text-muted-foreground">Rank: All India Rank from that year&apos;s NBEMS NEET PG result, where known. It is where one person got in, not a closing rank or a prediction. No contact details are held.</p>
            </>
          )}
          <ResidentsSources rows={residents.rows} sources={residents.sources} />
        </section>
      )}
    </AppPage>
  );
}
