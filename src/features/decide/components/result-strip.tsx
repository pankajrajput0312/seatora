"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { useDecideLinks } from "../lib/use-decide-store";
import { RESULT_CLOSED_COOKIE } from "../lib/round-status";
import type { ResultNews } from "../server/your-result";

/**
 * The latest round's result, while it is the newest news (server/your-result.ts resultNews), on every Decide page: where
 * to see it (her result on Home, the last rank by branch, every allotment of the round). ✕ closes it for this result
 * (a cookie the layout reads, so it never flashes back); the final result's strip shows again.
 */
export function ResultStrip({ news }: { news: ResultNews }) {
  const L = useDecideLinks();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => {
    document.cookie = `${RESULT_CLOSED_COOKIE}=${encodeURIComponent(news.id)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
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
