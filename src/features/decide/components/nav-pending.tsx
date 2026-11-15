"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A filter form (FilterBar's next/form GET) loading the next view of the same page: a route's loading.tsx shows only
 * when the route changes, so until the new view arrives the page dims under a pulsing bar, as DecideShell does for a
 * followed link. Ends when the address changes (or after 10 s: an Apply that changed nothing keeps the address).
 */
/**
 * Tell the shell a Decide navigation started that no link click shows (router.push / replace in code): it dims the page
 * until the address changes and keeps the navigation moving (DecideShell). `refresh`: a router.refresh(), same address,
 * so no dimming.
 */
export const NAV_EVENT = "decide:navigating";
export const navigating = (refresh = false) => window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { refresh } }));

export function NavPending({ children }: { children: React.ReactNode }) {
  const here = `${usePathname()}?${useSearchParams()}`;
  const [from, setFrom] = useState<string | null>(null);
  const pending = from === here;

  const onSubmit = (e: React.FormEvent) => {
    const form = e.target as HTMLFormElement;
    if (!form.getAttribute("action") || form.method.toLowerCase() !== "get") return; // next/form prevents the default itself
    setFrom(here);
    setTimeout(() => setFrom((f) => (f === here ? null : f)), 10_000);
  };

  return (
    <>
      <div onSubmit={onSubmit} aria-busy={pending || undefined} className={cn("transition-opacity", pending && "opacity-60")}>{children}</div>
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-50 h-0.5 bg-mark", pending ? "animate-pulse" : "hidden")} />
      <p role="status" className="sr-only">{pending ? "Loading the page…" : ""}</p>
    </>
  );
}
