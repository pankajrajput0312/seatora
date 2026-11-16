"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { claimFreeSeasonPass } from "../actions";

/** "Upgrade to Season Pass, free till 20 Nov": the free upgrade (claim.ts), then the page (and the layout: the sidebar and the plan chip) reads it again. */
export function ClaimFreePass({ label, className, noteClassName }: { label: React.ReactNode; className?: string; noteClassName?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const claim = () =>
    start(async () => {
      setError(null);
      const r = await claimFreeSeasonPass().catch(() => ({ ok: false as const, error: "Couldn't upgrade. Try again." }));
      if (!r.ok) return setError(r.error);
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
