"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AUTH_EVENT, LogOutButton } from "@/features/auth/components/log-out-button";
import { formatRank } from "@/features/cutoffs/lib/format";

/**
 * Signed in (the medpath_signed_in flag) and her AIR from the profile the planner saves in this browser
 * (features/decide/profile.ts PROFILE_KEY, not imported: it would bring zod to every site page). Read client-side, so
 * the header and the landing page stay static. Re-read on every navigation (sign-in/out redirects don't remount the
 * header) and when a sign-out finishes. null: signed out (or not read yet).
 */
export function useSignedIn() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ air: number | null } | null>(null);
  useEffect(() => {
    const read = () => {
      if (!document.cookie.split("; ").includes("medpath_signed_in=1")) return setMe(null);
      let air: number | null = null;
      try {
        const r = Number(JSON.parse(localStorage.getItem("medpath.profile") ?? "null")?.rank);
        air = Number.isInteger(r) && r > 0 ? r : null;
      } catch {}
      setMe({ air });
    };
    read();
    window.addEventListener(AUTH_EVENT, read);
    return () => window.removeEventListener(AUTH_EVENT, read);
  }, [pathname]);
  return me;
}

/** "Sign in" for a signed-out visitor; nothing when signed in (PlannerCta beside it is "Open my planner"). */
export function AuthLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return useSignedIn() ? null : (
    <Link href="/login" className={className} onClick={onClick}>
      Sign in
    </Link>
  );
}

/**
 * The main call to action: signed out, `label` to `href` (default "Get Seatora — Free", sign-up); signed in, "Open my
 * planner · AIR 42,284" (or `memberLabel`) to `member` (default the planner's home), never "Create free account".
 */
export function PlannerCta({ className, onClick, href = "/signup", label = "Get Seatora — Free", member = "/decide", memberLabel }: {
  className?: string; onClick?: () => void; href?: string; label?: React.ReactNode; member?: string; memberLabel?: string;
}) {
  const me = useSignedIn();
  return (
    <Link href={me ? member : href} className={className} onClick={onClick}>
      {!me ? label : memberLabel ?? <>Open my planner{me.air && <span className="numeric font-normal">· AIR {formatRank(me.air)}</span>}</>}
    </Link>
  );
}

/** The menu's Log out, signed in only. */
export function MenuLogOut({ className }: { className?: string }) {
  return useSignedIn() ? <LogOutButton className={className} /> : null;
}
