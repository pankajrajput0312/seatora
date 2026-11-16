"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { myPlan, type PlanChipData } from "../actions";

/** Dispatched on window when her plan changes in this page (the free upgrade), so the chip reads it again. */
export const PLAN_EVENT = "seatora:plan";

/**
 * "Free · 4/10 institutes today" in the Decide header, refreshed on every page change and on PLAN_EVENT. Links to Pricing;
 * without the Season Pass it carries an "Upgrade free" (free period) or "Upgrade" pill and links to Pricing's buy section.
 */
export function PlanChip() {
  const pathname = usePathname();
  const [d, setD] = useState<PlanChipData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void myPlan().then((x) => alive && setD(x));
    load();
    window.addEventListener(PLAN_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(PLAN_EVENT, load);
    };
  }, [pathname]);
  if (!d) return null;
  return (
    <Link href={d.upgrade ? "/pricing#buy" : "/pricing"} title={d.title} aria-label={`Your plan: ${d.title}${d.upgrade ? ` ${d.upgrade}` : ""}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-input px-2.5 text-xs whitespace-nowrap">
      <span className="font-semibold">{d.plan}</span>
      <span className="numeric hidden text-muted-foreground md:inline">· {d.usage}</span>
      {d.upgrade && <span className="-mr-1.5 rounded-full bg-foreground px-2 py-0.5 font-semibold text-background">{d.upgrade}</span>}
    </Link>
  );
}
