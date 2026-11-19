import { formatRank } from "@/features/cutoffs/lib/format";
import { baseCategories } from "@/features/decide/types";

// What a visitor came for, from sign-up's (or sign-in's) ?next=: the page reminds her ("…to see your options for AIR
// 18,500 (OBC)"). Most specific path first.
const PAGES: [string, string][] = [
  ["/decide/options", "your options"],
  ["/decide/residents", "the residents at each hospital"],
  ["/decide/fees", "fees, stipends and bonds"],
  ["/decide/seats", "this round's seats"],
  ["/decide/last-ranks", "last ranks by round"],
  ["/decide/institutes/", "this institute's page"],
  ["/decide/institutes", "every institute"],
  ["/decide/counselling", "the counselling schedule"],
  ["/decide/compare", "Compare"],
  ["/decide/choices", "your choice list"],
  ["/decide/plan", "the Season Pass"],
  ["/pricing", "the Season Pass"],
  ["/decide", "your planner"],
];

/** "your options for AIR 18,500 (OBC)", "the residents at each hospital"…; null without `next` or for any other page. */
export function cameFor(next: string | undefined | null) {
  if (!next?.startsWith("/")) return null;
  const u = new URL(next, "http://x");
  const what = PAGES.find(([p]) => u.pathname === p || u.pathname.startsWith(p.endsWith("/") ? p : `${p}/`))?.[1];
  if (!what) return null;
  const rank = Number(u.searchParams.get("rank"));
  const cat = u.searchParams.get("cat");
  if (what !== "your options" || !Number.isInteger(rank) || rank < 1) return what;
  return `your options for AIR ${formatRank(rank)}${cat && (baseCategories as readonly string[]).includes(cat) ? ` (${cat})` : ""}`;
}
