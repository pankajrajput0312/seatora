"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { navigating, toast } from "@/features/decide/components/nav-pending";
import { cn } from "@/lib/cn";
import { claimFreeSeasonPass } from "../actions";

/**
 * "Upgrade to Season Pass, free till 20 Nov": the free upgrade (claim.ts), then the page (and the layout: the sidebar and
 * the plan chip) reads it again; once the new card is in (this button unmounts) the toast says `done`.
 */
export function ClaimFreePass({ label, done, className, noteClassName }: { label: React.ReactNode; done: string; className?: string; noteClassName?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const claimed = useRef(false);
  useEffect(() => () => void (claimed.current && toast(done)), [done]);
  const claim = () =>
    start(async () => {
      setError(null);
      const r = await claimFreeSeasonPass().catch(() => ({ ok: false as const, error: "Couldn't upgrade. Try again." }));
      if (!r.ok) return setError(r.error);
      claimed.current = true;
      navigating(true); // inside Decide: the shell keeps the refresh moving (decide-shell.tsx)
      router.refresh();
    });
  return (
    <div>
      <button type="button" data-upgrade="" onClick={claim} disabled={pending} className={cn("inline-flex items-center justify-center disabled:opacity-50", className)}>
        {pending ? "Upgrading…" : label}
      </button>
      {error && <p role="status" className={cn("mt-1 text-xs", noteClassName)}>{error}</p>}
    </div>
  );
}
