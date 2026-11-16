"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, GitCompareArrows, House, IndianRupee, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp, Users } from "lucide-react";
import { Calculator } from "lucide-react";
import { CircleArrowUp, Gift, MessageCircle, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { MAX_COMPARE } from "../lib/choices";
import { useCompare, useDecideLinks, useSavedProfile } from "../lib/use-decide-store";
import { profileFromParams, profileInput, profileSchema, profileToParams, type Profile } from "../profile";
import { AccountSync } from "./account-sync";
import { NAV_EVENT, navigating } from "./nav-pending";
import { ProfileDialog, type ProfileMeta } from "./profile-dialog";
import { RenamedSaved } from "./renamed-saved";

const sections = [
  {
    title: "Plan",
    items: [
      { href: "/decide", label: "Home", icon: House },
      { href: "/decide/residents", label: "Residents", icon: Users },
      { href: "/decide/options", label: "Options", icon: SlidersHorizontal },
      { href: "/decide/seats", label: "Seats", icon: LayoutGrid },
      { href: "/decide/choices", label: "Choices", icon: ListOrdered },
      { href: "/decide/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  // Above Research: the round schedule must show without scrolling the sidebar on a 1280x800 laptop.
  { title: "Counselling", items: [{ href: "/decide/counselling", label: "Schedule & notices", icon: CalendarDays }] },
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
  { title: "Help", items: [{ href: "/decide/requests", label: "Request a feature", icon: MessageCircle }] },
];
// Phones: Home, Residents (the main feature), then the round's working screens; the fifth slot is the Compare tray when it
// has items, else Seats. Five columns fit every label at 360 px; Rank scan (and Seats while comparing) are in the menu.
const bottom = [
  { href: "/decide", label: "Home", icon: House },
  { href: "/decide/residents", label: "Residents", icon: Users },
  { href: "/decide/options", label: "Options", icon: SlidersHorizontal },
  { href: "/decide/choices", label: "Choices", icon: ListOrdered },
];

/** `phone`: the server's guess from the user agent (layout.tsx), so the first paint has the right layout. */
/** `ask`: the server says she is the owner with Ask Seatora on (layout.tsx); only then is its nav entry rendered. */
/** `admin`: the server says she is an owner or admin (layout.tsx); only then is the Admin nav entry rendered. */
/** `account`: the signed-in user (layout.tsx) for the sidebar's footer and the header's plan chip; null signed out. */
export function DecideShell({ meta, phone, ask, admin, account, children }: { meta: ProfileMeta; phone?: boolean; ask?: boolean; admin?: boolean; account: ShellAccount | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const L = useDecideLinks(); // every link keeps the profile params, repeated values included
  const [profile, setStored, hydrated] = useSavedProfile();
  // What the page is actually using: URL params override the saved profile.
  const shown = profileFromParams(new URLSearchParams(sp.toString())) ?? profile;
  const [compare] = useCompare(); // Zod-validated tray: a malformed value is an empty tray, never a crash
  const [editing, setEditing] = useState(false);
  // The first-run setup's destination while it loads: until then the effect below leaves the URL alone, or its
  // replace (the new profile into the page she was on) would cancel the push.
  const landing = useRef<string | null>(null);

  // URL params override; otherwise bring the saved profile into the URL. A URL profile that doesn't parse (a hand-edited
  // rank=abc or cat=GEN) counts as none, so the page and this sidebar both show the saved one, never a silent fallback.
  useEffect(() => {
    if (!hydrated) return;
    if (landing.current) {
      if (landing.current !== pathname) return;
      landing.current = null;
    }
    const next = new URLSearchParams(sp.toString());
    // Pages ask for the editor with ?editProfile=1 (e.g. the "Set your rank" button); open it once and drop the flag.
    const wantsEdit = next.get("editProfile") === "1";
    next.delete("editProfile");
    if (wantsEdit) setEditing(true);
    const saved = profile && profileToParams(profile, next);
    if (saved && !profileSchema.safeParse(profileInput(next)).success && `${saved}` !== `${next}`) {
      navigating();
      router.replace(`${pathname}?${saved}`, { scroll: false });
    } else if (wantsEdit) {
      navigating();
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  }, [hydrated, profile, sp, pathname, router]);

  const save = (p: Profile) => {
    setStored(p);
    // First run: on to Options, which opens on the current round's seats in her courses (service.ts optionsView).
    if (!shown) {
      landing.current = "/decide/options";
      navigating();
      return router.push(`/decide/options?${profileToParams(p)}`);
    }
    const next = profileToParams(p, new URLSearchParams(sp.toString()));
    next.delete("editProfile");
    if (`${next}` !== `${sp}`) navigating();
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

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

  const isCurrent = (href: string) => (href === "/decide" ? pathname === href : pathname.startsWith(href));
  // The sidebar: the Plan … Research groups, then Account (Refer & earn), then Help with Ask and Admin for those who have
  // them. Her name, plan and "Upgrade" are the footer (AccountFooter), pinned to the sidebar's and the menu's bottom.
  const help = sections.at(-1)!;
  const nav = [
    ...sections.slice(0, -1),
    { title: "Account", items: [{ href: "/decide/refer", label: "Refer & earn", icon: Gift }] },
    { ...help, items: [...help.items, ...(ask ? [{ href: "/decide/ask", label: "Ask Seatora", icon: Sparkles }] : []), ...(admin ? [{ href: "/decide/admin", label: "Admin", icon: ShieldCheck }] : [])] },
  ];

  return (
    <>
      <AppShell
        height="auto"
        variant="section"
        mobileNav={{ defaultIsMobile: phone }}
        topNav={
          <TopNav
            label="App"
            heading={<TopNavHeading logo={<LogoMark className="size-6" />} heading="Seatora Decide" headingHref={L.to("/decide")} />}
            endContent={
              <span className="flex items-center gap-1">
                {account && (
                  <Link href={L.to("/decide/plan")} title={account.plan} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-input px-2.5 text-xs whitespace-nowrap">
                    <span className="sr-only">Your plan: </span>
                    <span className="font-semibold">{account.upgrade ? "Free" : account.plan.split(" · ")[0]}</span>
                    {account.upgrade && <span className="-mr-1.5 rounded-full bg-[#5ccfe6] px-2 py-0.5 font-semibold text-[#0b0e12]">Upgrade</span>}
                  </Link>
                )}
                {/* Compare tray: in the sticky header (phones: the bottom bar), never floating over the page and the focused control. */}
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
                <button type="button" data-profile-edit aria-label={shown ? `AIR ${formatRank(shown.rank)} ${shown.category}${shown.pwd ? " PwD" : ""}: edit your rank and preferences` : "Set your rank"} onClick={() => setEditing(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-input px-2.5 text-xs whitespace-nowrap md:hidden">
                  {shown ? <><span className="numeric font-semibold">AIR {formatRank(shown.rank)}</span><span className="text-muted-foreground">· {shown.category}{shown.pwd ? " PwD" : ""}</span></> : hydrated ? "Set your rank" : "Loading…"}
                  <Pencil className="size-3 text-muted-foreground" aria-hidden />
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
                <p className="text-xs text-muted-foreground">Your rank</p>
                {shown ? (
                  <>
                    <p className="mt-0.5 text-2xl font-bold tracking-tight">{formatRank(shown.rank)}</p>
                    <p className="text-xs text-muted-foreground">
                      {shown.category}{shown.pwd ? " PwD" : ""}, {shown.pairs?.length ? `${shown.pairs.length} ${shown.pairs.length === 1 ? "course" : "courses"}` : shown.specialties.length ? `${shown.specialties.length} ${shown.specialties.length === 1 ? "specialty" : "specialties"}` : "all specialties"}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm">{hydrated ? "Not set yet" : "Loading…"}</p>
                )}
                <Button data-profile-edit variant="secondary" className="mt-2 w-full" aria-label={shown ? "Edit your rank and preferences" : "Set your rank"} onClick={() => setEditing(true)}>{shown ? "Edit" : "Set your rank"}</Button>
                <Link href="/" className="mt-1 inline-flex min-h-10 items-center text-sm text-muted-foreground hover:text-foreground md:hidden">Back to site</Link>
              </div>
            }
          >
            {nav.map((sec) => (
              <SideNavSection key={sec.title} title={sec.title}>
                {sec.items.map(({ href, label, icon }) => (
                  <SideNavItem key={href} label={label} icon={icon} href={href.startsWith("/decide") ? L.to(href) : href} isSelected={isCurrent(href)} {...(href === "/decide/residents" && { "data-accent": "residents", endContent: <span className="rounded-full bg-[#6d28d9] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">77K NAMES</span> })} {...(href === "/decide/ask" && { endContent: <span className="rounded-full bg-sky px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">BETA</span> })} {...(href === "/decide/refer" && { endContent: <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-background">20%</span> })} />
                ))}
              </SideNavSection>
            ))}
          </SideNav>
        }
      >
        {/* isolate: page overlays (filter panels) stay below the sticky header. */}
        <div aria-busy={loading || undefined} className={cn("isolate pb-[calc(6rem+env(safe-area-inset-bottom))] transition-opacity md:pb-0", loading && "opacity-60")}>
          <RenamedSaved />
          <AccountSync />
          {children}
        </div>
      </AppShell>

      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-50 h-0.5 bg-mark", loading ? "animate-pulse" : "hidden")} />
      <p role="status" className="sr-only">{loading ? "Loading the page…" : ""}</p>

      <nav data-bottom-bar aria-label="Decide shortcuts" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {[...bottom, compare.length ? { href: "/decide/compare", label: `Compare ${compare.length}/${MAX_COMPARE}`, icon: GitCompareArrows } : { href: "/decide/seats", label: "Seats", icon: LayoutGrid }].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href === "/decide/compare" ? L.compare(compare) : L.to(href)} aria-current={isCurrent(href) ? "page" : undefined} className={cn("flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px]", href === "/decide/residents" ? cn("font-semibold text-[#6d28d9]", isCurrent(href) ? "border-[#6d28d9]" : "border-transparent") : isCurrent(href) ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground")}>
            <span className="relative">
              <Icon className="size-[1.25rem]" strokeWidth={1.75} aria-hidden />
              {href === "/decide/residents" && <span className="absolute -top-1.5 -right-3 rounded-full bg-[#6d28d9] px-1 text-[8px] leading-3 font-bold text-white">NEW</span>}
            </span>
            <span className="numeric">{label}</span>
          </Link>
        ))}
      </nav>

      {editing && (
        <ProfileDialog
          key={JSON.stringify(shown)}
          open
          onOpenChange={(o) => {
            setEditing(o);
            if (!o) setTimeout(() => [...document.querySelectorAll<HTMLElement>("[data-profile-edit]")].find((e) => e.offsetParent !== null)?.focus(), 50);
          }}
          profile={shown}
          setup={!shown}
          meta={meta}
          onSave={save}
        />
      )}
    </>
  );
}

export type ShellAccount = { name: string; plan: string; upgrade: boolean; freeTill: string | null };

const cyan = "flex min-h-11 flex-col items-center justify-center rounded-md bg-[#5ccfe6] px-3 py-1 text-[#0b0e12] hover:bg-[#7fdcef]";

/**
 * The sidebar's (and the phone menu's) bottom: her initial, name and plan line, both to /decide/plan, and above it a cyan
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
        <Link href={href} className={cyan}>
          <span className="flex items-center gap-1.5 text-sm font-bold"><CircleArrowUp className="size-4" aria-hidden />Upgrade</span>
          {account.freeTill && <span className="text-xs font-semibold">Free till {account.freeTill}</span>}
        </Link>
      )}
      <Link href={href} aria-current={current ? "page" : undefined} className={cn("flex min-h-12 items-center gap-2.5 rounded-md px-2 hover:bg-muted", current && "bg-muted")}>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0b0e12] text-sm font-bold text-[#5ccfe6]">{account.name[0]?.toUpperCase()}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{account.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{account.plan}</span>
        </span>
      </Link>
    </div>
  );
}
