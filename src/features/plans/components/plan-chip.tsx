"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { myPlan, type PlanChipData } from "../actions";

/** "Free · 4/10 institutes today" in the Decide header, refreshed on every page change. Links to Pricing. */
export function PlanChip() {
  const pathname = usePathname();
  const [d, setD] = useState<PlanChipData | null>(null);
  useEffect(() => {
    let alive = true;
    void myPlan().then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, [pathname]);
  if (!d) return null;
  return (
    <Link href="/pricing" title={d.title} aria-label={`Your plan: ${d.title}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-input px-2.5 text-xs whitespace-nowrap">
      <span className="font-semibold">{d.plan}</span>
      <span className="numeric hidden text-muted-foreground md:inline">· {d.usage}</span>
    </Link>
  );
}
