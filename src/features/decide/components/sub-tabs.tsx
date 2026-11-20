import Link from "next/link";
import { cn } from "@/lib/cn";
import { ScrollToCurrent } from "./focus-item";

/** Link-based sub-navigation (not ARIA tabs): each view has its own URL. Too wide for the screen, it scrolls sideways and fades at the edge with more (fade-x). */
export function SubTabs({ label, items, current }: { label: string; items: { key: string; label: string; href: string; accent?: boolean }[]; current: string }) {
  return (
    <nav aria-label={label} className="fade-x flex gap-1 overflow-x-auto overflow-y-hidden border-b border-edge">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined} className={cn("-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap", t.accent ? (t.key === current ? "border-residents font-semibold text-residents" : "border-transparent font-semibold text-residents hover:text-foreground") : t.key === current ? "border-sky font-semibold text-foreground" : "border-transparent text-muted-foreground hover:border-edge hover:text-foreground")}>
          {t.label}
          {t.accent && <span className="ml-1.5 rounded-sm bg-wash px-1.5 text-xs leading-5 font-semibold text-sky">Names</span>}
        </Link>
      ))}
      <ScrollToCurrent />
    </nav>
  );
}
