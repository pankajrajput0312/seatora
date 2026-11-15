// Cards | Table for a results page. The server renders only the view on show (half the HTML or less): the choice is
// `layout=cards|table` in the address (`layout`, not `view`: Options' and Seats' `view` is their own list view), else
// the one she picked last on this device (a cookie the toggle sets, server/view.ts chosenView), else cards on a phone
// and the table elsewhere (deviceView). Switching is a navigation to `?layout=…` (links: works without JS).
// No "use client" here: the server reads VIEW_PARAM, parseView and ViewPanes; the toggle is in view-toggle-client.tsx.

export type View = "cards" | "table";

/** The address param of the choice. */
export const VIEW_PARAM = "layout";

/** A `layout` value from the address or the cookie (untrusted): only the two views, else null. */
export const parseView = (v: unknown): View | null => (v === "cards" || v === "table" ? v : null);

/** The cookie that tells the server the choice she made on this device, per page. */
export const viewCookie = (page: string) => `medpath.view.${page}`;

/**
 * Nothing chosen: cards on a phone, the table elsewhere. `mobileHint`: the Sec-CH-UA-Mobile header (Chromium sends it
 * by default), else the user agent's "Mobi" (phones; Android tablets leave it out), iPhone or iPod.
 */
export const deviceView = (ua: string | null, mobileHint: string | null): View =>
  mobileHint === "?1" || (mobileHint !== "?0" && /Mobi|iPhone|iPod/i.test(ua ?? "")) ? "cards" : "table";

/** This page's address with `layout` set, every other param kept (relative: "?…"). */
export const viewHref = (params: URLSearchParams | null, v: View) => {
  const p = new URLSearchParams(params?.toString());
  p.set(VIEW_PARAM, v);
  return `?${p}`;
};

export { ViewField, ViewToggle } from "./view-toggle-client";

/**
 * The view on show of the same results (`view`: chosenView on the server, or passed down to a client list). Only that
 * one is rendered, so only it cites its documents in the page's Sources. `page`: the toggle's key, for the reader.
 */
export function ViewPanes({ view, cards, table }: { page: string; view: View; cards: React.ReactNode; table: React.ReactNode }) {
  return <div data-view-pane={view}>{view === "cards" ? cards : table}</div>;
}
