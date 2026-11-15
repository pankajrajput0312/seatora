import Link from "next/link";
import { cn } from "@/lib/cn";

/** Link-based sub-navigation (not ARIA tabs): each view has its own URL. */
export function SubTabs({ label, items, current }: { label: string; items: { key: string; label: string; href: string; accent?: boolean }[]; current: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined} className={cn("-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap", t.accent ? (t.key === current ? "border-violet-600 font-semibold text-violet-700" : "border-transparent font-semibold text-violet-700 hover:text-violet-900") : t.key === current ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
