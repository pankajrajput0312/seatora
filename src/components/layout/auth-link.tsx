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

/** "Sign in", or "My planner" (the planner's home) when signed in. */
export function AuthLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const me = useSignedIn();
  return (
    <Link href={me ? "/decide" : "/login"} className={className} onClick={onClick}>
      {me ? "My planner" : "Sign in"}
    </Link>
  );
}

/** The main call to action: "Get Seatora — Free" (sign-up), or "Open my planner · AIR 42,284" when signed in. */
export function PlannerCta({ className, onClick }: { className?: string; onClick?: () => void }) {
  const me = useSignedIn();
  return (
    <Link href={me ? "/decide" : "/signup"} className={className} onClick={onClick}>
      {me ? <>Open my planner{me.air && <span className="numeric font-normal">· AIR {formatRank(me.air)}</span>}</> : "Get Seatora — Free"}
    </Link>
  );
}

/** The menu's Log out, signed in only. */
export function MenuLogOut({ className }: { className?: string }) {
  return useSignedIn() ? <LogOutButton className={className} /> : null;
}
