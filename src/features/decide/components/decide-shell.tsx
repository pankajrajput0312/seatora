"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GitCompareArrows, ListOrdered, ScanSearch, SlidersHorizontal } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { COMPARE_KEY, MAX_COMPARE } from "../lib/choices";
import { useLocal } from "../lib/local-store";
import { PROFILE_KEY, profileFromParams, profileParamKeys, profileSchema, profileToParams, type Profile } from "../profile";
import { ProfileDialog, type ProfileMeta } from "./profile-dialog";

const nav = [
  { href: "/decide", label: "Overview" },
  { href: "/decide/options", label: "Options" },
  { href: "/decide/choices", label: "Choices" },
  { href: "/decide/compare", label: "Compare" },
  { href: "/decide/rank-scan", label: "Rank scan" },
  { href: "/decide/last-ranks", label: "Last ranks" },
  { href: "/decide/seats", label: "Seats" },
  { href: "/decide/counselling", label: "Counselling" },
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
      <div className="border-b border-border bg-sun/10">
        <Container className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs text-sun">
          <strong className="font-medium">Demo data — illustrative only.</strong>
          <span className="text-muted-foreground">Institutes are examples. Real MCC data will replace it.</span>
        </Container>
      </div>
      <div className="border-b border-border">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
          <nav aria-label="Decide" className="-mx-2 flex max-w-full gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link key={n.href} href={withProfile(n.href)} aria-current={isCurrent(n.href) ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-md px-3 text-sm whitespace-nowrap", isCurrent(n.href) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setEditing(true)}>
            {shown ? (
              <span className="numeric">
                AIR {formatRank(shown.rank)} · {shown.category}{shown.pwd ? " PwD" : ""} · {shown.specialties.length || "all"} {shown.specialties.length === 1 ? "course" : "courses"}
              </span>
            ) : (
              "Set your rank"
            )}
          </Button>
        </Container>
      </div>

      <div className="pb-24 md:pb-0">{children}</div>

      {compare.length > 0 && (
        <div className="fixed right-4 bottom-20 z-30 md:bottom-6">
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

      <ProfileDialog open={editing} onOpenChange={setEditing} profile={shown} meta={meta} onSave={save} />
    </>
  );
}
