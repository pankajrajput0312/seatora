"use client";

import { useState, useSyncExternalStore } from "react";
import { ResultCard } from "./result-card";
import { HideableRow } from "./residents/hideable-row";

type Hide = (id: string) => Promise<{ ok: true; data: null } | { ok: false; error: string }>;
const HIDDEN = "Hidden. This name won't be shown again.";

// Names hidden since this page loaded. The cards and the table are both in the page (ViewPanes), so a name hidden in
// one view shows as hidden in the other too, before any reload.
const hiddenNow = new Set<string>();
const subs = new Set<() => void>();
const markHidden = (id: string) => {
  hiddenNow.add(id);
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
const useHiddenNow = (id: string) => useSyncExternalStore(subscribe, () => hiddenNow.has(id), () => false);

/**
 * A resident as a ResultCard with the Residents table's two-step "Hide" (Hide, then Confirm) in its header. Once hidden
 * the card says so in place and takes focus; the next page load leaves it out. The rest of the props are ResultCard's.
 * ponytail: the card twin of residents/hideable-row.tsx (same steps and focus); share one hook when both can change.
 */
export function HideableCard({ id, name, hide, ...card }: { id: string; name: string; hide: Hide } & Omit<React.ComponentProps<typeof ResultCard>, "actions">) {
  void id; void name; void hide; // Hide control taken out (owner, 15 Nov 2026); names are hidden on request by email.
  return <ResultCard {...card} />;
}

/** HideableRow for the Residents page: hides with its card (the other view), and shows as hidden when the card was. */
export function SyncedHideableRow(props: React.ComponentProps<typeof HideableRow>) {
  const gone = useHiddenNow(props.id);
  // Hidden from this row: HideableRow shows it (with its focus move).
  const [own, setOwn] = useState(false);
  if (gone && !own)
    return (
      <tr className={props.className}>
        <td colSpan={props.colSpan} role="status" className="px-4 py-3 text-sm text-muted-foreground">{HIDDEN}</td>
      </tr>
    );
  const hide = async (id: string) => {
    const r = await props.hide(id);
    if (r.ok) {
      setOwn(true);
      markHidden(id);
    }
    return r;
  };
  return <HideableRow {...props} hide={hide} />;
}
