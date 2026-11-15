"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Vercel Web Analytics + Speed Insights (cookieless). Addresses are sent WITHOUT their query: planner URLs carry a rank,
// category and, on Residents, picked names, none of which may leave the site.
const pathOnly = <T extends { url: string }>(e: T): T => {
  const u = new URL(e.url);
  return { ...e, url: `${u.origin}${u.pathname}` };
};

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={(e: BeforeSendEvent) => pathOnly(e)} />
      <SpeedInsights beforeSend={(e) => pathOnly(e)} />
    </>
  );
}
