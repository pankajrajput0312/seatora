import { ViewPanesClient } from "./view-toggle-client";

// Cards | Table for a results page. The choice is `layout=cards|table` in the address (works without JS: two links;
// `layout`, not `view`: Options' and Seats' `view` is their own list view), and
// with JS it is saved per page on the device (and in a cookie the server reads: server/view.ts), so it survives Apply,
// paging and the nav links. Nothing chosen: cards below md, the table
// from md up (CSS only, so the first paint is right on every screen).
// No "use client" here: the server reads VIEW_PARAM and parseView too (a client module's exports are only references
// there), and ViewPanes drops the pane not shown before it reaches the client. The hooks and buttons are in
// view-toggle-client.tsx.

export type View = "cards" | "table";

/** The address param of the choice. */
export const VIEW_PARAM = "layout";

/** A `layout` value from the address or the device (untrusted): only the two views, else null. */
export const parseView = (v: unknown): View | null => (v === "cards" || v === "table" ? v : null);

/** The cookie that tells the server the choice saved on the device (chosenView), so a return visit gets one pane. */
export const viewCookie = (page: string) => `medpath.view.${page}`;

/** This page's address with `layout` set, every other param kept (relative: "?…"). */
export const viewHref = (params: URLSearchParams | null, v: View) => {
  const p = new URLSearchParams(params?.toString());
  p.set(VIEW_PARAM, v);
  return `?${p}`;
};

/** A pane's classes: the chosen view shows, the other is hidden; nothing chosen, the breakpoint decides. */
export const paneClass = (chosen: View | null, pane: View) =>
  chosen ? (chosen === pane ? undefined : "hidden") : pane === "cards" ? "md:hidden" : "max-md:hidden";

export { useView, ViewField, ViewToggle } from "./view-toggle-client";

/**
 * Both views of the same results, one shown (`paneClass`): pages render `cards` and `table` from the same rows, so the
 * toggle switches without a round trip. Give ids (a Pager focus target) to elements outside the panes, never inside.
 * `view`: the choice the address names, when the page knows it (`parseView(params.get(VIEW_PARAM))`): only that pane
 * is rendered (half the HTML: every row's (i) tips once, not twice), and the toggle fetches the page again for the
 * other. Only the pane on show cites its documents in the page's Sources.
 */
export function ViewPanes({ page, view, cards, table }: { page: string; view?: View | null; cards: React.ReactNode; table: React.ReactNode }) {
  return view ? <ViewPanesClient page={page} only={view}>{view === "cards" ? cards : table}</ViewPanesClient> : <ViewPanesClient page={page} cards={cards} table={table} />;
}
