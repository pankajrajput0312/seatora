import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Calculator, GitCompareArrows, IndianRupee, LayoutGrid, ListOrdered, MessageCircle, ScanSearch, SlidersHorizontal, Table2, TrendingUp, Users } from "lucide-react";
import type { DecideLinks } from "../lib/links";

// The planner's home: a promo card (Residents, free till 19 Nov) and every tool as a coloured tile, phone-app style.
const FREE_UNTIL = "19 Nov";

const tiles = [
  { href: "/decide/residents", label: "Residents", icon: Users, tone: "bg-[#f3efff] text-[#6d28d9] border-[#ddd0ff]", badge: "NEW" },
  { href: "/decide/options", label: "Options", icon: SlidersHorizontal, tone: "bg-[#eef4ff] text-[#2952cc] border-[#d6e2ff]" },
  { href: "/decide/seats", label: "Seat Matrix", icon: LayoutGrid, tone: "bg-[#eaf8f0] text-[#13804b] border-[#cdeedb]" },
  { href: "/decide/fees", label: "Fee & Bond", icon: IndianRupee, tone: "bg-[#fff0f1] text-[#c0263a] border-[#ffd6db]" },
  { href: "/decide/allotments", label: "Allotments", icon: Table2, tone: "bg-[#eef4ff] text-[#2952cc] border-[#d6e2ff]" },
  { href: "/decide/last-ranks", label: "Last Ranks", icon: TrendingUp, tone: "bg-[#f6efff] text-[#7c3aed] border-[#e6d8ff]" },
  { href: "/decide/institutes", label: "Institutes", icon: Building2, tone: "bg-[#eef2f7] text-[#334155] border-[#dde3ea]" },
  { href: "/decide/compare", label: "Compare", icon: GitCompareArrows, tone: "bg-[#fff8e6] text-[#b45309] border-[#fbe7b5]" },
  { href: "/decide/choices", label: "Choice List", icon: ListOrdered, tone: "bg-[#fff0f6] text-[#be185d] border-[#ffd3e6]" },
  { href: "/decide/rank-scan", label: "Rank Scan", icon: ScanSearch, tone: "bg-[#eef6ff] text-[#0369a1] border-[#d3e8fb]" },
  { href: "/decide/counselling", label: "Schedule", icon: CalendarDays, tone: "bg-[#eefbf6] text-[#0f766e] border-[#cdeee4]" },
  { href: "/decide/rank-tools", label: "Score & Rank", icon: Calculator, tone: "bg-[#f4f4f5] text-[#3f3f46] border-[#e4e4e7]" },
] as const;

export function HomeHub({ L }: { L: DecideLinks }) {
  return (
    <div className="grid gap-3">
      <section aria-labelledby="promo-h" className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b3d2e] via-[#0f5a43] to-[#11806a] p-4 text-white shadow-sm sm:p-5">
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[#ffd84d]">
          <span className="size-2 rounded-full bg-[#4ade80]" aria-hidden /> FREE TILL {FREE_UNTIL.toUpperCase()}
        </p>
        <h2 id="promo-h" className="mt-2 text-xl font-bold leading-tight sm:text-2xl">
          Residents&apos; names are <span className="text-[#ffd84d]">live now</span>
        </h2>
        <p className="mt-1 text-sm text-white/85">77,000+ residents · 1,800+ hospitals · MCC lists 2023–2025</p>
        <p className="text-sm text-white/70">Plus options for your rank, seats, fees, stipend and bond.</p>
        <Link href={L.to("/decide/residents")} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#ffd84d] px-4 text-sm font-bold text-[#1a1a1a] hover:bg-[#ffe27a]">
          Open Residents <ArrowRight className="size-4" aria-hidden />
        </Link>
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-white/25 pt-3">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-white/70">SEASON PASS</span>
          <span className="flex items-baseline gap-2">
            <s className="text-sm text-white/60" aria-label="Was ₹499">₹499</s>
            <span className="text-2xl font-extrabold text-[#ffd84d]">₹0</span>
            <span className="text-xs text-white/80">everything free till {FREE_UNTIL}</span>
          </span>
        </div>
      </section>
      <nav aria-label="Tools" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {tiles.map(({ href, label, icon: Icon, tone, ...t }) => (
          <Link key={href} href={L.to(href)} className={`relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-center text-[12px] font-medium text-foreground transition hover:shadow-sm ${tone.split(" ").filter((c) => c.startsWith("bg-") || c.startsWith("border-")).join(" ")}`}>
            {"badge" in t && <span className="absolute -top-1.5 right-1 rounded-full bg-[#f97316] px-1.5 text-[9px] font-bold leading-4 text-white">{t.badge}</span>}
            <Icon className={`size-6 ${tone.split(" ").find((c) => c.startsWith("text-"))}`} strokeWidth={1.75} aria-hidden />
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
        <Link href={L.to("/decide/requests")} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-1 py-2 text-center text-[12px] font-medium text-muted-foreground">
          <MessageCircle className="size-6" strokeWidth={1.75} aria-hidden />
          <span className="leading-tight">Request</span>
        </Link>
      </nav>
    </div>
  );
}
