// The public colleges lists (/neet-pg/colleges, /neet-pg/colleges/state/<state>) and the breadcrumb the college and
// branch pages share. Server-rendered: the type filter is radio chips read by CSS (:has), like the branch tables' tabs;
// no client JS.
import "server-only";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { collegePath, typeKeys, type IndexRow, type TypeKey } from "./colleges";

export const L = "underline decoration-foreground/25 underline-offset-4 hover:text-sky";
const th = "px-3 py-3 font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4";
const chip = "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground has-[:checked]:bg-raised has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
// Whole class names, so Tailwind sees them: a checked type chip hides every row of another type.
const FILTER: Record<TypeKey, string> = {
  govt: "has-[#ct-govt:checked]:[&_tr[data-type]:not([data-type=govt])]:hidden",
  govt_private: "has-[#ct-govt_private:checked]:[&_tr[data-type]:not([data-type=govt_private])]:hidden",
  private: "has-[#ct-private:checked]:[&_tr[data-type]:not([data-type=private])]:hidden",
  deemed: "has-[#ct-deemed:checked]:[&_tr[data-type]:not([data-type=deemed])]:hidden",
  afms: "has-[#ct-afms:checked]:[&_tr[data-type]:not([data-type=afms])]:hidden",
  public_sector: "has-[#ct-public_sector:checked]:[&_tr[data-type]:not([data-type=public_sector])]:hidden",
  unknown: "has-[#ct-unknown:checked]:[&_tr[data-type]:not([data-type=unknown])]:hidden",
};
/** The rows' look, set once on the table (not per cell: a state's page has 200 rows, its HTML stays small). */
const ROWS = [
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr:hover]:bg-muted [&_[data-na]]:text-muted-foreground",
  "[&_tbody_th]:px-3 [&_tbody_th]:py-2.5 [&_tbody_th]:text-left [&_tbody_th]:font-normal [&_tbody_th]:break-words md:[&_tbody_th]:px-4",
  "[&_td]:numeric [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-right md:[&_td]:px-4 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground",
  "[&_a]:underline [&_a]:decoration-foreground/25 [&_a]:underline-offset-4 [&_a:hover]:text-sky",
].join(" ");
const quotaShort: Record<string, string> = { "Deemed/Paid Seats": "deemed", "DNB Quota": "DNB" };

/**
 * Colleges with their type, courses and their most competitive course's Open last rank in the round (IndexRow order),
 * filtered by type. `place`: the line under a name, its state (the index) or PIN code (a state's page).
 */
export function CollegeList({ rows, caption, place, className }: { rows: IndexRow[]; caption: string; place: "state" | "pincode"; className?: string }) {
  const types = typeKeys.map((t) => ({ ...t, n: rows.filter((r) => r.type.key === t.key).length })).filter((t) => t.n);
  return (
    <div className={cn(Object.values(FILTER).join(" "), className)}>
      {types.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">College type</legend>
          <label className={chip}>
            <input type="radio" name="ct" id="ct-all" defaultChecked className="sr-only" />
            All <span className="numeric text-xs">{rows.length}</span>
          </label>
          {types.map((t) => (
            <label key={t.key} className={chip}>
              <input type="radio" name="ct" id={`ct-${t.key}`} className="sr-only" />
              {t.label} <span className="numeric text-xs">{t.n}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <table className={cn("w-full text-sm", ROWS)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(th, "text-left")}>College</th>
              <th scope="col" className={cn(th, "hidden text-left md:table-cell")}>Type</th>
              <th scope="col" className={cn(th, "hidden text-right md:table-cell")}>Courses</th>
              <th scope="col" className={cn(th, "text-right")}>Last rank, Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} data-type={r.type.key}>
                <th scope="row">
                  <Link href={collegePath(r.slug)}>{r.label}</Link>
                  <small>{r[place] ?? ""}<span className="md:hidden">{` · ${r.type.label}${r.courses ? ` · ${r.courses} courses` : ""}`}</span></small>
                </th>
                <td className="hidden text-left! text-muted-foreground md:table-cell">{r.type.label}</td>
                <td className="hidden md:table-cell">{r.courses || <span data-na="">—</span>}</td>
                <td>{r.best ? <>{formatRank(r.best.closing)}<small>{`${r.best.course}${quotaShort[r.best.quota] ? `, ${quotaShort[r.best.quota]}` : ""}`}</small></> : <span data-na="">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The page's trail, the last one the page itself (its BreadcrumbList JSON-LD is the page's). */
export function Crumbs({ items }: { items: [string, string][] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        {items.map(([name, href], i) =>
          i < items.length - 1 ? (
            <li key={href} className="flex gap-x-2">
              <Link href={href} className={L}>{name}</Link>
              <span aria-hidden>/</span>
            </li>
          ) : (
            <li key={href} aria-current="page">{name}</li>
          ),
        )}
      </ol>
    </nav>
  );
}
