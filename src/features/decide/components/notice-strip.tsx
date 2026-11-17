"use client";

import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { NOTICE_CLOSED_COOKIE } from "../lib/round-status";

/**
 * Home's alert strip (round-status.tsx HeldStrip): what MCC has held, "reported by MCC", its notice, and ✕, which closes
 * this notice's strip for good (a cookie the server reads, so it never flashes back); a new notice shows again.
 */
export function NoticeStrip({ id, text, href }: { id: string; text: string; href: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const close = () => {
    document.cookie = `${NOTICE_CLOSED_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    setOpen(false);
  };
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-sun/40 bg-sun/10 py-1.5 pr-1 pl-3 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-sun" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{text}</span>, reported by MCC.{" "}
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold whitespace-nowrap underline underline-offset-2">
          View notice<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
      <button type="button" onClick={close} aria-label="Close this notice" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sun/10 hover:text-foreground">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
