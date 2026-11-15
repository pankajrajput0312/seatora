"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DisplayMenu, useHiddenCols } from "../seats/seat-matrix";
import { useView, VIEW_PARAM, viewHref, type View } from "../view-toggle";

const DISPLAY_KEY = "medpath.allotments.hidden";
/** Hidden until she picks them in Display: each rank's Journey shows both. */
const DEFAULT_HIDDEN = ["cand", "option"];

/**
 * Allotments' column chooser (the Seats matrix's): hides `#allotments [data-col]` cells by CSS, saved on the device.
 * The page renders it only with the table.
 */
export function AllotmentsDisplay({ cols }: { cols: { key: string; label: string }[] }) {
  const [hidden, save] = useHiddenCols(DISPLAY_KEY, cols, DEFAULT_HIDDEN);
  return (
    <>
      <DisplayMenu cols={cols} hidden={hidden} setHidden={save} always="Rank, round and institute always show." />
      {/* Only known column keys reach the selector. */}
      <style>{[...hidden].map((k) => `#allotments [data-col="${k}"]{display:none}`).join("")}</style>
    </>
  );
}

const noSubscribe = () => () => {};

/**
 * The one results pane the server rendered (`shown`: never both, 50 rows of term tips each). The view she wants is her
 * choice (the address, else the device: ViewToggle's), else `shown`. When it differs (the toggle switched, a saved
 * choice) the page is fetched again with that `layout`, the old pane dimmed meanwhile. The wanted view goes into the
 * `cookie` the server reads after the address, so a visit, Apply or Clear comes back in it; when the address names no
 * layout, `shown` is written into it, so ViewToggle (whose own default is the table from md up) marks the right one.
 */
export function AllotmentsPane({ shown, cookie, children }: { shown: View; cookie: string; children: React.ReactNode }) {
  const chosen = useView("allotments");
  // After hydration only: before it the device's choice is not read yet.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const want = chosen ?? shown;
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    if (!hydrated) return;
    document.cookie = `${cookie}=${want}; path=/decide/allotments; max-age=31536000; samesite=lax`;
    const inAddress = sp?.get(VIEW_PARAM) === want;
    if (want !== shown) {
      // The toggle already put `layout` in the address (no reload): fetch it again; else go to it with `layout`.
      if (inAddress) router.refresh();
      else router.replace(viewHref(sp, want), { scroll: false });
    } else if (!inAddress) window.history.replaceState(null, "", viewHref(sp, want));
  }, [hydrated, want, shown, cookie, router, sp]);
  const busy = hydrated && want !== shown;
  return <div aria-busy={busy || undefined} className={busy ? "opacity-60 transition-opacity" : undefined}>{children}</div>;
}
