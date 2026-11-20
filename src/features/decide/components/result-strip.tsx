"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { useDecideLinks } from "../lib/use-decide-store";
import { RESULT_CLOSED_COOKIE } from "../lib/round-status";
import type { ResultNews } from "../server/your-result";

// The result closed in this tab: the layout's `resultStrip` is read once per full load, and the strip unmounts on Home.
let closedHere: string | null = null;

/** Closes the strip for this result (a cookie the layout reads, so it never flashes back): the strip's ✕ and Home's result card's. */
export const closeResultNews = (id: string) => {
  closedHere = id;
  document.cookie = `${RESULT_CLOSED_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
};

/**
 * The latest round's result, while it is the newest news (server/your-result.ts resultNews), on every Decide page but
 * Home (its result card says it): where to see it (her result on Home, the last rank by branch, every allotment of the
 * round). ✕ closes it for this result (closeResultNews); the final result's strip shows again.
 */
export function ResultStrip({ news }: { news: ResultNews }) {
  const L = useDecideLinks();
  const [open, setOpen] = useState(() => closedHere !== news.id);
  if (!open) return null;
  const close = () => {
    closeResultNews(news.id);
    setOpen(false);
  };
  const link = "font-semibold whitespace-nowrap text-sky underline underline-offset-2";
  return (
    <div className="px-4 pt-4 md:px-6 xl:px-10" data-print-hide>
      <div role="status" className="flex items-center gap-2 rounded-lg border border-sky/40 bg-sky/10 py-1 pr-1 pl-3 text-sm">
        <Megaphone className="size-4 shrink-0 text-sky" aria-hidden />
        <p className="min-w-0 flex-1 py-1">
          <span className="font-semibold">NEET PG {news.name} result is out{news.provisional && " (provisional)"}</span>
          {" · "}<Link href={L.to("/decide", {}, "#your-result-h")} className={link}>Your result</Link>
          {" · "}<Link href="/neet-pg#lr-h" className={link}>Last ranks by branch</Link>
          {" · "}<Link href={L.allotments({ year: news.year, round: news.round })} className={link}>All allotments</Link>
        </p>
        <button type="button" onClick={close} aria-label={`Close the ${news.name} result note`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sky/10 hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
