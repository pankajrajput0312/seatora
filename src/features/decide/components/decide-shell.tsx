"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, GitCompareArrows, IndianRupee, LayoutDashboard, LayoutGrid, ListOrdered, ScanSearch, SlidersHorizontal, Table2, TrendingUp } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { COMPARE_KEY, MAX_COMPARE } from "../lib/choices";
import { useLocal } from "../lib/local-store";
import { PROFILE_KEY, profileFromParams, profileParamKeys, profileSchema, profileToParams, type Profile } from "../profile";
import { ProfileDialog, type ProfileMeta } from "./profile-dialog";

const sections = [
  {
    title: "Plan",
    items: [
      { href: "/decide", label: "Overview", icon: LayoutDashboard },
      { href: "/decide/options", label: "Options", icon: SlidersHorizontal },
      { href: "/decide/choices", label: "Choices", icon: ListOrdered },
      { href: "/decide/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  {
    title: "Research",
    items: [
      { href: "/decide/institutes", label: "Institutes", icon: Building2 },
      { href: "/decide/last-ranks", label: "Last ranks", icon: TrendingUp },
      { href: "/decide/allotments", label: "Allotments", icon: Table2 },
      { href: "/decide/rank-scan", label: "Rank scan", icon: ScanSearch },
      { href: "/decide/fees", label: "Fees & bond", icon: IndianRupee },
      { href: "/decide/seats", label: "Seats", icon: LayoutGrid },
    ],
  },
  { title: "Counselling", items: [{ href: "/decide/counselling", label: "Schedule & notices", icon: CalendarDays }] },
];
const bottom = [
  { href: "/decide/options", label: "Options", icon: SlidersHorizontal },
  { href: "/decide/choices", label: "Choices", icon: ListOrdered },
  { href: "/decide/rank-scan", label: "Rank scan", icon: ScanSearch },
];

/** Keeps profile params on every link so server pages can read the profile. */
function useWithProfile() {
  const sp = useSearchParams();
  return (href: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    for (const k of profileParamKeys) { const v = sp.get(k); if (v) p.set(k, v); }
    const qs = p.toString();
    return qs ? `${href}?${qs}` : href;
  };
}

export function DecideShell({ meta, children }: { meta: ProfileMeta; children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const withProfile = useWithProfile();
  const [stored, setStored, hydrated] = useLocal<Profile | null>(PROFILE_KEY, null);
  const profile = stored && profileSchema.safeParse(stored).success ? stored : null;
  // What the page is actually using: URL params override the saved profile.
  const shown = profileFromParams(new URLSearchParams(sp.toString())) ?? profile;
  const [compare] = useLocal<string[]>(COMPARE_KEY, []);
  const [editing, setEditing] = useState(false);

  // URL params override; otherwise bring the saved profile into the URL.
  useEffect(() => {
    if (!hydrated) return;
    const next = new URLSearchParams(sp.toString());
    // Pages ask for the editor with ?editProfile=1 (e.g. the "Set your rank" button); open it once and drop the flag.
    const wantsEdit = next.get("editProfile") === "1";
    next.delete("editProfile");
    if (wantsEdit) setEditing(true);
    if (profile && !next.get("rank")) router.replace(`${pathname}?${profileToParams(profile, next)}`, { scroll: false });
    else if (wantsEdit) router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [hydrated, profile, sp, pathname, router]);

  const save = (p: Profile) => {
    setStored(p);
    const next = profileToParams(p, new URLSearchParams(sp.toString()));
    next.delete("editProfile");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const isCurrent = (href: string) => (href === "/decide" ? pathname === href : pathname.startsWith(href));

  return (
    <>
      <AppShell
        height="auto"
        variant="section"
        banner={meta.isDemo && <p className="bg-sun/10 px-4 py-1.5 text-center text-xs text-sun"><strong className="font-semibold">Demo data — illustrative only.</strong> Institutes are examples; real MCC data will replace them.</p>}
        topNav={
          <TopNav
            label="App"
            heading={<TopNavHeading logo={<LogoMark className="size-6" />} heading="MEDPATH Decide" headingHref={withProfile("/decide")} />}
            endContent={<Link href="/" className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground">Back to site</Link>}
          />
        }
        sideNav={
          <SideNav
            aria-label="Decide"
            header={
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">Your rank</p>
                {shown ? (
                  <>
                    <p className="mt-0.5 text-2xl font-bold tracking-tight">{formatRank(shown.rank)}</p>
                    <p className="text-xs text-muted-foreground">
                      {shown.category}{shown.pwd ? " PwD" : ""}, {shown.specialties.length ? `${shown.specialties.length} ${shown.specialties.length === 1 ? "course" : "courses"}` : "all courses"}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm">Not set yet</p>
                )}
                <Button data-profile-edit variant="secondary" className="mt-2 w-full" aria-label={shown ? "Edit your rank and preferences" : "Set your rank"} onClick={() => setEditing(true)}>{shown ? "Edit" : "Set your rank"}</Button>
              </div>
            }
          >
            {sections.map((sec) => (
              <SideNavSection key={sec.title} title={sec.title}>
                {sec.items.map(({ href, label, icon }) => (
                  <SideNavItem key={href} label={label} icon={icon} href={withProfile(href)} isSelected={isCurrent(href)} />
                ))}
              </SideNavSection>
            ))}
          </SideNav>
        }
      >
        {/* Phones: the sidebar lives in the drawer, so keep the rank and Edit visible here. */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 md:hidden">
          <p className="text-sm">{shown ? <><span className="font-bold">AIR {formatRank(shown.rank)}</span> <span className="text-muted-foreground">{shown.category}{shown.pwd ? " PwD" : ""}</span></> : "Rank not set"}</p>
          <Button data-profile-edit variant="secondary" aria-label={shown ? "Edit your rank and preferences" : "Set your rank"} onClick={() => setEditing(true)}>{shown ? "Edit" : "Set your rank"}</Button>
        </div>
        <div className="pb-24 md:pb-0">{children}</div>
      </AppShell>

      {compare.length > 0 && (
        <div className="fixed right-4 bottom-20 z-30 md:bottom-6" data-print-hide>
          <Button asChild className="shadow-overlay">
            <Link href={withProfile("/decide/compare", { ids: compare.join(",") })}>
              <GitCompareArrows className="size-4" /> Compare {compare.length}/{MAX_COMPARE}
            </Link>
          </Button>
        </div>
      )}

      <nav aria-label="Decide shortcuts" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background md:hidden">
        {bottom.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={withProfile(href)} aria-current={isCurrent(href) ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-xs", isCurrent(href) ? "text-foreground" : "text-muted-foreground")}>
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
            {label}
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
          meta={meta}
          onSave={save}
        />
      )}
    </>
  );
}
