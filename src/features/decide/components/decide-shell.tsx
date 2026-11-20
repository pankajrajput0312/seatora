"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, GitCompareArrows, House, IndianRupee, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp, Users } from "lucide-react";
import { Calculator } from "lucide-react";
import { Award, CircleArrowUp, Gift, Globe, LogOut, Menu, MessageCircle, Pencil, ShieldCheck, Sparkles, X } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LogOutButton } from "@/features/auth/components/log-out-button";
import { compactRank, formatRank } from "@/features/cutoffs/lib/format";
import { examShows, neetPg, type Exam } from "@/features/exams/exam";
import { DEFAULT_EXAM, scopedKey, type ExamKey } from "@/features/exams/keys";
import { MAX_COMPARE } from "../lib/choices";
import { pageFilters, withFilters } from "../lib/links";
import { readLocal } from "../lib/local-store";
import { ExamContext, useCompare, useDecideLinks, useSavedProfile, useTrying } from "../lib/use-decide-store";
import { categoryFromText, PROFILE_KEY, profileFromParams, profileInput, profileSchema, profileToParams, type Profile } from "../profile";
import { AccountSync } from "./account-sync";
import { BackToTop } from "./back-to-top";
import { NAV_EVENT, navigating, TOAST_EVENT } from "./nav-pending";
import { categoryName, ProfileDialog, profileSub, type ProfileMeta } from "./profile-dialog";
import { RenamedSaved } from "./renamed-saved";
import { ResultStrip } from "./result-strip";
import type { ResultNews } from "../server/your-result";
import { PHONE_QUERY, WIDTH_COOKIE } from "./view-toggle";

const sections = [
  {
    title: "Plan",
    items: [
      { href: "/decide", label: "Home", icon: House },
      { href: "/decide/residents", label: "Residents", icon: Users },
      { href: "/decide/options", label: "Options", icon: SlidersHorizontal },
      { href: "/decide/seats", label: "Seats", icon: LayoutGrid },
      { href: "/decide/choices", label: "Choice list", icon: ListOrdered },
      { href: "/decide/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  // Above Research: the round schedule must show without scrolling the sidebar on a 1280x800 laptop.
  { title: "Counselling", items: [{ href: "/decide/counselling", label: "Schedule", icon: CalendarDays }] },
  {
    title: "Research",
    items: [
      { href: "/decide/institutes", label: "Institutes", icon: Building2 },
      { href: "/decide/last-ranks", label: "Last ranks", icon: TrendingUp },
      { href: "/decide/allotments", label: "Allotments", icon: Table2 },
      { href: "/decide/rank-scan", label: "Rank scan", icon: ScanSearch },
      { href: "/decide/rank-tools", label: "Score & rank", icon: Calculator },
      { href: "/decide/fees", label: "Fees & bond", icon: IndianRupee },
    ],
  },
  // Seatora home: phones only (the top bar's "Back to site" is hidden there).
  { title: "Help", items: [{ href: "/decide/requests", label: "Help & feedback", icon: MessageCircle }, { href: "/", label: "Seatora home", icon: Globe }] },
];
// Phones: Home, Residents (the main feature), the research she comes for, then More: the whole menu (the drawer), where
// Options, Seats, Choice list and the rest are. Five columns fit every label at 360 px. The Compare tray, when it has
// items, is a pill above the bar (never in place of a tab).
const bottom = [
  { href: "/decide", label: "Home", icon: House },
  { href: "/decide/residents", label: "Residents", icon: Users },
  { href: "/decide/institutes", label: "Institutes", icon: Building2 },
  { href: "/decide/last-ranks", label: "Last ranks", icon: TrendingUp },
];
/** The nav's "Round 2 result" entry (layout.tsx `result`): its link is the round's allotments, made in Shell. */
const RESULT_ITEM = "result";
/** The pages the nav brings her back to with their filters (this tab, each exam its own: sessionStorage). */
const navPaths = [...sections.flatMap((x) => x.items), ...bottom].map(({ href }) => href);
const filtersKey = (path: string, exam: ExamKey) => scopedKey(`decide:filters:${path}`, exam);

/** `phone`: the server's guess from the user agent (layout.tsx), so the first paint has the right layout. */
/** `ask`: the server says she is the owner with Ask Seatora on (layout.tsx); only then is its nav entry rendered. */
/** `admin`: the server says she is an owner or admin (layout.tsx); only then is the Admin nav entry rendered. */
/** `account`: the signed-in user (layout.tsx) for the sidebar's footer and the header's plan chip; null signed out. */
/** `listName`: the round she fills next, for her first choice list's name (RenamedSaved). */
/** `result`: the latest round's result while it is the newest news (layout.tsx): the nav's "Round 2 result" and, unless she closed it (`resultStrip` false), the strip above every page. */
/**
 * `exam`: staff only (layout.tsx): the exam shown, with a switcher (`choices`: every exam, with the pages each lacks) in
 * the header; the nav leaves out pages it has no data for, and every saved thing (her profile, choice lists, compare
 * tray) is that exam's own (ExamContext). Without it NEET PG (exams/exam.ts): no other exam's words reach the browser.
 */
export function DecideShell(props: ShellProps) {
  return (
    <ExamContext value={props.exam ?? neetPg}>
      <Shell {...props} />
    </ExamContext>
  );
}
export type ExamChoice = { key: ExamKey; label: string; lacks: string[] };
type ShellProps = { meta: ProfileMeta; phone?: boolean; ask?: boolean; admin?: boolean; exam?: Exam; choices?: ExamChoice[]; account: ShellAccount | null; listName?: string | null; result?: ResultNews | null; resultStrip?: boolean; children: React.ReactNode };

function Shell({ meta, phone, ask, admin, exam, choices, account, listName, result, resultStrip, children }: ShellProps) {
  const E = exam ?? neetPg;
  const ex = E.key;
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const L = useDecideLinks(); // every link keeps the profile params, repeated values included
  const [profile, setStored, hydrated] = useSavedProfile();
  const [menuOpen, setMenuOpen] = useState(false); // the phone menu (drawer): its ☰ and the bottom bar's More
  // What the page is actually using: URL params override the saved profile.
  const inUrl = profileFromParams(new URLSearchParams(sp.toString()));
  const shown = inUrl ?? profile;
  // Trying a rank (useTrying): nothing is saved until she says so; links carry the address's profile, so every page
  // shows the one she is trying.
  const trying = useTrying();
  // A `cat` the URL has that is no category (cat=XYZ): said, never a silent fallback (the saved profile, else Open).
  const [badCat, setBadCat] = useState<string | null>(null);
  const [compare] = useCompare(); // Zod-validated tray: a malformed value is an empty tray, never a crash
  const [editing, setEditing] = useState<false | "edit" | "try">(false);
  // The first-run setup's destination while it loads: until then the effect below leaves the URL alone, or its
  // replace (the new profile into the page she was on) would cancel the push.
  const landing = useRef<string | null>(null);

  // URL params override; otherwise bring the saved profile into the URL. A URL profile that doesn't parse (a hand-edited
  // rank=abc or cat=XYZ; cat=UR or GEN is Open) counts as none, so the page and this sidebar both show the saved one, and
  // an unknown category says so (badCat).
  useEffect(() => setBadCat(null), [pathname]);
  // The window's class for the server (server/view.ts isPhone): the next page's layout and Cards | Table follow the width
  // she has now, not the user agent's guess, and a narrowed desktop window counts as a phone.
  useEffect(() => {
    const mq = matchMedia(PHONE_QUERY);
    const put = () => (document.cookie = `${WIDTH_COOKIE}=${mq.matches ? "phone" : "wide"}; path=/decide; max-age=31536000; samesite=lax`);
    put();
    mq.addEventListener("change", put);
    return () => mq.removeEventListener("change", put);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (landing.current) {
      if (landing.current !== pathname) return;
      landing.current = null;
    }
    const next = new URLSearchParams(sp.toString());
    const cat = next.get("cat");
    if (cat && !categoryFromText(cat)) setBadCat(cat);
    // Pages ask for the editor with ?editProfile=1 (e.g. the "Set your rank" button), or =try ("Try a rank"); open it
    // once and drop the flag.
    const asked = next.get("editProfile");
    const wantsEdit = asked === "1" || asked === "try";
    next.delete("editProfile");
    // While she is trying a rank, every way into the editor (Options' "Widen your courses", Edit) is the try-only one:
    // its Save would otherwise make the trial her saved profile.
    if (wantsEdit) setEditing(asked === "try" || trying ? "try" : "edit");
    const saved = profile && profileToParams(profile, next);
    if (saved && !profileSchema.safeParse(profileInput(next)).success && `${saved}` !== `${next}`) {
      navigating();
      router.replace(`${pathname}?${saved}`, { scroll: false });
    } else if (wantsEdit) {
      navigating();
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  }, [hydrated, profile, sp, pathname, router, trying]);

  // "Saved your rank" after each save, or another page's toast() (nav-pending.tsx): a few seconds, above the phone's bottom bar.
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const on = (e: Event) => setToast({ text: String((e as CustomEvent).detail), at: Date.now() });
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);

  // Each nav page's remembered filters (this tab, this exam), and the ones she had when a trial began: "Back to my rank"
  // puts those back, so a filter she added while trying (Options' "0 of 9") goes with the trial.
  const pretrialKey = scopedKey("decide:pretrial", ex);
  const backToMine = (p: Profile) => {
    let before: Record<string, string> = {};
    try {
      before = JSON.parse(sessionStorage.getItem(pretrialKey) ?? "{}");
      sessionStorage.removeItem(pretrialKey);
      for (const path of navPaths) sessionStorage.setItem(filtersKey(path, ex), before[path] ?? "");
    } catch {
      // storage blocked: this page without its filters
    }
    const next = profileToParams(p, new URLSearchParams(before[pathname] ?? ""));
    if (ex !== DEFAULT_EXAM) next.set("exam", ex);
    navigating();
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // Into the page's address, saved (Save) or not ("Try without saving": only the address changes, the saved one stays).
  const apply = (p: Profile, keep: boolean) => {
    try {
      if (keep) sessionStorage.removeItem(pretrialKey);
      // A trial begins: the filters she has now, for "Back to my rank".
      else if (!trying) sessionStorage.setItem(pretrialKey, JSON.stringify({ ...Object.fromEntries(navPaths.map((path) => [path, sessionStorage.getItem(filtersKey(path, ex)) ?? ""])), [pathname]: pageFilters(sp) }));
    } catch {
      // storage blocked: Back to my rank drops every filter
    }
    if (keep) {
      // The editor works on the address's profile: what Home last showed her (`seen`, never in the address) stays hers.
      setStored(profile?.seen ? { ...p, seen: profile.seen } : p);
      setToast({ text: "Saved your rank", at: Date.now() });
    }
    // First run: on to Options, which opens on the current round's seats in her courses (service.ts optionsView).
    if (!shown) {
      landing.current = "/decide/options";
      navigating();
      return router.push(`/decide/options?${profileToParams(p, new URLSearchParams(ex === DEFAULT_EXAM ? "" : { exam: ex }))}`);
    }
    const next = profileToParams(p, new URLSearchParams(sp.toString()));
    next.delete("editProfile");
    if (`${next}` !== `${sp}`) navigating();
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const save = (p: Profile) => apply(p, true);

  // Loading: a Decide link was followed and its page hasn't arrived (pages render on the server, no Suspense, so
  // without this nothing moves for a second or two). Cleared when the address changes.
  const [loading, setLoading] = useState(false);
  const here = `${pathname}?${sp}`;
  useEffect(() => setLoading(false), [here]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin === location.origin && u.pathname.startsWith("/decide") && u.pathname + u.search !== location.pathname + location.search) setLoading(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // React (19.2 canary in Next 15.5) sometimes loses the ping of a same-route navigation's data (new search params under
  // a loading.tsx): the transition never commits until something else updates. Any update retries it, so while a
  // navigation is pending the shell re-renders now and then (backing off); cleared when the address changes.
  // ponytail: drop once upstream is fixed (check: Options, a reach chip or Next page, with this effect removed).
  const [kick, setKick] = useState(0); // a router.refresh() to keep moving (no address change, so no dimming)
  const [, nudge] = useState(0);
  useEffect(() => {
    if (!loading && !kick) return;
    let ms = 300;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      nudge((n) => n + 1);
      if (ms < 10_000) t = setTimeout(tick, (ms *= 2)); // 6 nudges over ~19 s
    };
    t = setTimeout(tick, ms);
    const give = setTimeout(() => setLoading(false), 15_000); // never dimmed for good (a navigation that went nowhere)
    return () => {
      clearTimeout(t);
      clearTimeout(give);
    };
  }, [loading, kick]);
  useEffect(() => {
    const on = (e: Event) => ((e as CustomEvent<{ refresh?: boolean }>).detail?.refresh ? setKick((k) => k + 1) : setLoading(true));
    window.addEventListener(NAV_EVENT, on);
    return () => window.removeEventListener(NAV_EVENT, on);
  }, []);

  // Each page's own filters, kept for this tab (sessionStorage), so the bottom bar and the sidebar bring her back to the
  // page as she left it; a link that carries its own params (a chip, "See them on Seats") is followed as it is.
  const [last, setLast] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      // Each exam's own (a NEET PG course filter means nothing on NEET MDS).
      sessionStorage.setItem(filtersKey(pathname, ex), pageFilters(sp));
      setLast(Object.fromEntries(navPaths.map((href) => [href, sessionStorage.getItem(filtersKey(href, ex)) ?? ""])));
    } catch {
      // storage blocked: nav links without them
    }
  }, [pathname, sp, ex]);
  const navHref = (href: string) => withFilters(L.to(href), last[href]);

  const isCurrent = (href: string) => (href === "/decide" || href === "/" ? pathname === href : pathname.startsWith(href));
  // The sidebar: the Plan … Research groups, then Account (Refer & earn), then Help with Ask and Admin for those who have
  // them. Her name, plan and "Upgrade" are the footer (AccountFooter), pinned to the sidebar's and the menu's bottom.
  const help = sections.at(-1)!;
  const shows = ({ href }: { href: string }) => examShows(E, href);
  // The round's result while it is the newest news: under Schedule, every allotment of that round (the drawer on phones too).
  const resultHref = result && L.allotments({ year: result.year, round: result.round });
  const onResult = !!result && pathname === "/decide/allotments" && sp.get("year") === String(result.year) && sp.get("round") === result.round;
  const nav = [
    ...sections.slice(0, -1).map((sec) => (result && sec.title === "Counselling" ? { ...sec, items: [...sec.items, { href: RESULT_ITEM, label: `${result.name} result`, icon: Award }] } : sec)),
    { title: "Account", items: [{ href: "/decide/refer", label: "Refer & earn", icon: Gift }] },
    { ...help, items: [...help.items, ...(ask ? [{ href: "/decide/ask", label: "Ask Seatora", icon: Sparkles }] : []), ...(admin ? [{ href: "/decide/admin", label: "Admin", icon: ShieldCheck }] : [])] },
  ]
    .map((sec) => ({ ...sec, items: sec.items.filter(shows) }))
    .filter((sec) => sec.items.length);
  // Staff's exam switcher, through /decide/exam (app/decide/exam/route.ts: the staff cookie, ?exam= in the URL for any
  // exam but NEET PG, an institute the exam lacks → its institutes). The URL's profile and page filters are this exam's:
  // they go, and the next exam's saved profile comes in (none: none). A page that exam lacks opens Home.
  const pickExam = (k: ExamKey) => {
    const saved = profileSchema.safeParse(readLocal<unknown>(scopedKey(PROFILE_KEY, k), null));
    const next = saved.success ? profileToParams(saved.data) : new URLSearchParams();
    const lacks = choices?.find((c) => c.key === k)?.lacks ?? [];
    const path = lacks.includes(pathname) ? "/decide" : pathname;
    navigating();
    // A full load (the layout: this shell's exam, the dialog's courses, every saved store, is the next exam's too), and a
    // new history entry, so Back returns to this exam's page as it was.
    location.assign(`/decide/exam?${new URLSearchParams({ k, next: `${path}${next.size ? `?${next}` : ""}` })}`);
  };
  // Staff: the URL names the exam this shell shows. A client navigation whose link lost ?exam= gets it back (the page would
  // read NEET PG's data under this exam's shell); one naming another exam is loaded whole.
  useEffect(() => {
    if (!choices) return;
    const asked = sp.get("exam") ?? DEFAULT_EXAM;
    if (asked === ex) return;
    const next = new URLSearchParams(sp.toString());
    if (!sp.has("exam")) {
      next.set("exam", ex);
      router.replace(`${pathname}?${next}`, { scroll: false });
    } else location.assign(`${pathname}?${next}`);
  }, [choices, sp, ex, pathname, router]);

  return (
    <>
      <AppShell
        height="auto"
        variant="section"
        mobileNav={{ defaultIsMobile: phone, isOpen: menuOpen, onOpenChange: setMenuOpen }}
        topNav={
          <TopNav
            label="App"
            heading={<TopNavHeading logo={<LogoMark className="size-6" />} heading="Seatora Decide" headingHref={L.to("/decide")} />}
            endContent={
              // Phones: the chips drop words by the bar's width in rem (a container query, so a larger text size drops them
              // sooner), then shrink (globals.css): never over the logo.
              <span data-topbar-end className="flex min-w-0 items-center gap-2.5">
                {choices && (
                  <select aria-label="Exam" value={ex} onChange={(e) => pickExam(e.target.value as ExamKey)} className="hit h-8 rounded-full border border-input bg-card px-2.5 text-xs font-semibold">
                    {choices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                )}
                {account && (
                  <Link href={L.to("/decide/plan")} title={account.plan} data-upgrade={account.upgrade ? "header_chip" : undefined} className={cn("hit inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-input px-2.5 text-xs whitespace-nowrap", !account.upgrade && "@max-[25rem]/topbar:hidden")}>
                    <span className="sr-only">Your plan: </span>
                    <span className={cn("truncate font-semibold", account.upgrade && "@max-[25rem]/topbar:hidden")}>{account.upgrade ? "Free" : account.plan.split(" · ")[0]}</span>
                    {account.upgrade && <span className="-mr-1.5 rounded-full bg-[#5ccfe6] px-2 py-0.5 font-semibold text-[#0b0e12]">Upgrade</span>}
                  </Link>
                )}
                {/* Compare tray: in the sticky header (phones: a pill above the bottom bar; scroll-padding keeps focus clear of it). */}
                {compare.length > 0 && (
                  <span className="hidden md:block" data-print-hide>
                    <Button asChild variant="secondary">
                      {/* Name from the content, so it contains the visible "2/4" (WCAG 2.5.3). */}
                      <Link href={L.compare(compare)}>
                        <GitCompareArrows className="size-4" aria-hidden /> <span className="sr-only">Compare </span><span className="numeric">{compare.length}/{MAX_COMPARE}</span><span className="sr-only"> selected</span>
                      </Link>
                    </Button>
                  </span>
                )}
                {/* Phones: the rank and its edit button as one chip here (the sidebar, with its rank card, is in the drawer). */}
                <button type="button" data-profile-edit aria-label={shown ? `${E.rankWord} ${formatRank(shown.rank)} ${profileSub(E, shown)}: edit your rank and preferences` : "Set your rank"} onClick={() => setEditing(trying ? "try" : "edit")}
                  className="hit inline-flex h-8 min-w-0 items-center gap-1 rounded-full border border-input px-2.5 text-xs whitespace-nowrap md:hidden">
                  {shown ? <><span className="numeric shrink-0 font-semibold"><span className="@max-[23.75rem]/topbar:hidden">{`${E.rankWord} `}</span><span className="@max-[21.25rem]/topbar:hidden">{formatRank(shown.rank)}</span><span className="hidden @max-[21.25rem]/topbar:inline">{compactRank(shown.rank)}</span></span><span className="truncate text-muted-foreground @max-[25rem]/topbar:hidden">{E.perGroup ? `· ${profileSub(E, shown)}` : <>· {categoryName(shown.category)}{shown.pwd ? " PwD" : ""}</>}</span></> : <span className="truncate">{hydrated ? <>Set <span className="@max-[23.75rem]/topbar:hidden">your </span>rank</> : "Loading…"}</span>}
                  <Pencil className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                <Link href="/" className="hidden min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground md:inline-flex">Back to site</Link>
              </span>
            }
          />
        }
        sideNav={
          <SideNav
            aria-label="Decide"
            footer={<AccountFooter account={account} href={L.to("/decide/plan")} current={pathname === "/decide/plan"} />}
            header={
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{ex === DEFAULT_EXAM ? "Your rank" : `Your ${E.label} rank`}</p>
                {shown ? (
                  <>
                    <p className="mt-0.5 text-2xl font-bold tracking-tight">{formatRank(shown.rank)}</p>
                    <p className="text-xs text-muted-foreground">
                      {E.perGroup ? profileSub(E, shown) : <>{shown.category}{shown.pwd ? " PwD" : ""}</>}, {shown.pairs?.length ? `${shown.pairs.length} ${shown.pairs.length === 1 ? "course" : "courses"}` : shown.specialties.length ? `${shown.specialties.length} ${shown.specialties.length === 1 ? "specialty" : "specialties"}` : "all specialties"}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm">{hydrated ? "Not set yet" : "Loading…"}</p>
                )}
                <Button data-profile-edit variant="secondary" className="mt-2 w-full" aria-label={shown ? "Edit your rank and preferences" : "Set your rank"} onClick={() => setEditing(trying ? "try" : "edit")}>{shown ? "Edit" : "Set your rank"}</Button>
                <Link href="/" className="mt-1 inline-flex min-h-10 items-center text-sm text-muted-foreground hover:text-foreground md:hidden">Back to site</Link>
              </div>
            }
          >
            {nav.map((sec) => (
              <SideNavSection key={sec.title} title={sec.title}>
                {sec.items.map(({ href, label, icon }) => (
                  <SideNavItem key={href} label={label} icon={icon} href={href === RESULT_ITEM ? resultHref! : href.startsWith("/decide") ? navHref(href) : href} isSelected={href === RESULT_ITEM ? onResult : isCurrent(href) && !(onResult && href === "/decide/allotments")} {...(href === "/decide/residents" && { "data-accent": "residents", endContent: <span className={newBadge}>New</span> })} {...(href === "/decide/ask" && { endContent: <span className="rounded-full bg-sky px-1.5 text-xs font-bold text-white">BETA</span> })} {...(href === "/decide/refer" && { endContent: <span className="rounded-full bg-foreground px-1.5 text-xs font-bold text-background">20%</span> })} {...(href === "/" && { className: "md:hidden" })} />
                ))}
              </SideNavSection>
            ))}
          </SideNav>
        }
      >
        {/* isolate: page overlays (filter panels) stay below the sticky header. */}
        <div aria-busy={loading || undefined} data-no-terms={!E.has.fees || undefined} className={cn("isolate transition-opacity md:pb-0", compare.length ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-[calc(6rem+env(safe-area-inset-bottom))]", loading && "opacity-60")}>
          <RenamedSaved listName={listName} />
          {/* Home's result card says it (your-result.tsx). */}
          {result && resultStrip && pathname !== "/decide" && <ResultStrip news={result} />}
          {(trying || badCat) && inUrl && (
            <div className="grid gap-2 px-4 pt-4 md:px-6 xl:px-10" data-print-hide>
              {badCat && (
                <p role="status" className="flex items-start gap-2 rounded-md border border-sun/40 bg-sun/10 py-1 pr-1 pl-3 text-sm">
                  <span className="min-w-0 flex-1 py-1.5">
                    The address&apos;s category “{badCat}” isn&apos;t one Seatora knows, so this shows {E.perGroup ? "your rank" : <>{categoryName(inUrl.category)}{inUrl.pwd ? " PwD" : ""}</>}{profile && !trying ? ", as you saved it" : ""}.{" "}
                    {E.categories.length > 1 && <>Categories: {E.categories.map(categoryName).join(", ")}; add PwD with “-PwD” (UR-PwD).</>}
                  </span>
                  <Button variant="ghost" size="icon" className="shrink-0 max-md:size-9" aria-label="Close this note" onClick={() => setBadCat(null)}><X className="size-4" aria-hidden /></Button>
                </p>
              )}
              {trying && (
                // One line on a wide screen; on a phone, the rank, then its two buttons (flush with the text).
                <p role="status" className="flex flex-wrap items-center gap-x-3 rounded-md border border-sky/40 bg-sky/10 px-3 py-0.5 text-sm">
                  <span className="min-w-[13rem] flex-1 py-1">
                    <span className="font-semibold">Trying <span className="numeric">{E.rankWord} {formatRank(inUrl.rank)}</span> · {profileSub(E, inUrl)}</span> — not saved.
                  </span>
                  <span className="flex flex-wrap gap-x-1 max-md:-ml-2">
                    <Button variant="ghost" size="sm" className="text-sky max-md:h-10" onClick={() => save(inUrl)}>Save as mine</Button>
                    {profile && <Button variant="ghost" size="sm" className="text-sky max-md:h-10" onClick={() => backToMine(profile)}>Back to my rank</Button>}
                  </span>
                </p>
              )}
            </div>
          )}
          <AccountSync key={ex} />
          {children}
        </div>
      </AppShell>

      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-50 h-0.5 bg-mark", loading ? "animate-pulse" : "hidden")} />
      <p role="status" className="sr-only">{loading ? "Loading the page…" : ""}</p>
      <p role="status" className={cn("pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-fit rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-overlay md:bottom-6", !toast && "sr-only")}>
        {toast?.text ?? ""}
      </p>

      <BackToTop />
      {/* Phones: the Compare tray, a one-line pill above the bottom bar's left end (Top sits at its right end). */}
      {compare.length > 0 && !isCurrent("/decide/compare") && (
        <Link href={L.compare(compare)} data-compare-pill className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-3 z-30 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold whitespace-nowrap shadow-overlay md:hidden print:hidden">
          <GitCompareArrows className="size-4" aria-hidden />Compare <span className="numeric">{compare.length}/{MAX_COMPARE}</span><span className="sr-only"> selected</span>
        </Link>
      )}
      <nav data-bottom-bar aria-label="Decide shortcuts" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {bottom.filter(shows).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={navHref(href)} aria-current={isCurrent(href) ? "page" : undefined} className={cn("flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 border-t-2 text-xs", href === "/decide/residents" ? cn("font-semibold text-residents", isCurrent(href) ? "border-residents" : "border-transparent") : isCurrent(href) ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground")}>
            <span className="relative">
              <Icon className="size-[1.25rem]" strokeWidth={1.75} aria-hidden />
              {href === "/decide/residents" && <span className={cn(newBadge, "absolute -top-2 left-1/2 ml-2.5 bg-background")}>New</span>}
            </span>
            <span className="numeric">{label}</span>
          </Link>
        ))}
        {/* More: the menu, marked current on any page that isn't one of the tabs. */}
        <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} className={cn("flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 border-t-2 text-xs", bottom.some(({ href }) => isCurrent(href)) ? "border-transparent text-muted-foreground" : "border-foreground font-semibold text-foreground")}>
          <Menu className="size-[1.25rem]" strokeWidth={1.75} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {editing && (
        <ProfileDialog
          key={JSON.stringify(shown)}
          open
          onOpenChange={(o) => {
            if (o) return;
            setEditing(false);
            setTimeout(() => [...document.querySelectorAll<HTMLElement>("[data-profile-edit]")].find((e) => e.offsetParent !== null)?.focus(), 50);
          }}
          profile={shown}
          // "Try a rank" (first run's ?editProfile=try): the whole editor at once, not the setup's steps.
          setup={!shown && editing !== "try"}
          trial={editing === "try"}
          meta={meta}
          onSave={save}
          onTry={(p) => apply(p, false)}
        />
      )}
    </>
  );
}

/** Residents' "New": a small outlined badge in the item's own colour (currentColor), never a fill like the current item's. */
const newBadge = "rounded-full border border-current px-1.5 text-xs leading-4 font-semibold";

export type ShellAccount = { name: string; plan: string; upgrade: boolean; freeTill: string | null };

const cyan = "flex min-h-11 flex-col items-center justify-center rounded-md bg-[#5ccfe6] px-3 py-1 text-[#0b0e12] hover:bg-[#7fdcef]";

/**
 * The sidebar's (and the phone menu's) bottom: her initial, name and plan line, both to /decide/plan, Log out beside them, and above it a cyan
 * "Upgrade" without the Season Pass ("Free till 20 Nov" in the free period). Signed out: Create free account and Sign in.
 * `data-nav-footer`: globals.css pins it to the menu's bottom (Astryx pins it in the sidebar).
 */
function AccountFooter({ account, href, current }: { account: ShellAccount | null; href: string; current: boolean }) {
  if (!account)
    return (
      <div data-nav-footer className="grid gap-2 border-t border-border pt-2">
        <Link href="/signup?next=%2Fdecide" className={cn(cyan, "text-sm font-bold")}>Create free account</Link>
        <Link href="/login?next=%2Fdecide" className="inline-flex min-h-11 items-center justify-center rounded-md border border-input text-sm font-semibold">Sign in</Link>
      </div>
    );
  return (
    <div data-nav-footer className="grid gap-1.5 border-t border-border pt-2">
      {account.upgrade && (
        <Link href={href} data-upgrade="sidebar_footer" className={cyan}>
          <span className="flex items-center gap-1.5 text-sm font-bold"><CircleArrowUp className="size-4" aria-hidden />Upgrade</span>
          {account.freeTill && <span className="text-xs font-semibold">Free till {account.freeTill}</span>}
        </Link>
      )}
      <div className="flex min-w-0 items-center gap-1">
        <Link href={href} aria-current={current ? "page" : undefined} className={cn("flex min-h-12 max-md:min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 hover:bg-muted", current && "bg-muted")}>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0b0e12] text-sm font-bold text-[#5ccfe6]">{account.name[0]?.toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{account.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{account.plan}</span>
          </span>
        </Link>
        <LogOutButton
          className="flex min-h-12 min-w-12 max-md:min-h-11 max-md:min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground aria-disabled:opacity-60"
          label="text-xs font-semibold"
          icon={<LogOut className="size-4" aria-hidden />}
        />
      </div>
    </div>
  );
}
