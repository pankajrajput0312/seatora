"use client";

import { useEffect } from "react";
import type { CLIENT_EVENTS, Placement } from "../lib";

// The browser's side of the funnel (docs/FUNNEL.md): POST /api/events by sendBeacon. Identity comes from cookies there.

type Body = { name: (typeof CLIENT_EVENTS)[number]; placement?: Placement } | { kind: "client_error"; message: string; route: string };

/** Sends without waiting: sendBeacon, else a keepalive fetch. Never throws. */
export function beacon(body: Body) {
  try {
    const data = JSON.stringify(body);
    if (!navigator.sendBeacon?.("/api/events", data)) void fetch("/api/events", { method: "POST", body: data, keepalive: true }).catch(() => {});
  } catch {}
}

const sent = new Set<string>();

/** A page view (landing, pricing, sign-up, refer), once per page load. */
export function TrackView({ name }: { name: "landing_view" | "pricing_view" | "signup_view" | "referral_page_view" }) {
  useEffect(() => {
    if (sent.has(name)) return;
    sent.add(name);
    beacon({ name });
  }, [name]);
  return null;
}

/**
 * upgrade_click for every Upgrade call to action: a click on an element with data-upgrade; the placement is its value,
 * else the nearest data-placement around it (the pop-up, the paywall, Pricing…). One listener, in the root layout.
 */
export function UpgradeClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const cta = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-upgrade]") : null;
      if (!cta) return;
      const placement = cta.dataset.upgrade || cta.closest<HTMLElement>("[data-placement]")?.dataset.placement;
      beacon({ name: "upgrade_click", ...(placement && { placement: placement as Placement }) });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}

/**
 * For error.tsx boundaries: reports a browser error once (message, path; no query). An error with a digest was thrown on
 * the server (it arrives with Next's generic message) and onRequestError has grouped it already: not sent twice.
 */
export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    if (!error.digest) beacon({ kind: "client_error", message: String(error.message), route: location.pathname });
  }, [error]);
}
