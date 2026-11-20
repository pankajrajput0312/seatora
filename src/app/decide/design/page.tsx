import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead, Provisional } from "@/features/decide/components/bits";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import { FilterForm, FilterSection, FiltersPanel, ToolbarCount, ToolbarSearch } from "@/features/decide/components/filter-form";
import { InfoTip } from "@/features/decide/components/info-tip";
import { NoticeStrip } from "@/features/decide/components/notice-strip";
import { ResultCard } from "@/features/decide/components/result-card";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { SkCards, SkStats, SkTable } from "@/features/decide/components/skeleton";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { chip, control, EmptyState, Field, StatStrip, tbl, toolbar } from "@/features/decide/components/ui";
import { LayoutMenu, SortMenu } from "@/features/decide/components/view-menu";
import { cn } from "@/lib/cn";
import { Swatch } from "./swatch";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

// The inside app's design system in one place, for the owner's review (docs/APP_DESIGN_SYSTEM.md): every token and the
// shared components in their states. Staff only (OWNER / ADMIN); anyone else gets the 404. Sample values, never data.

// Each swatch's class written out whole, so Tailwind generates it (a role like reach-reached has no variable of its own).
const colours: { title: string; about: string; items: [cls: string, note: string, text?: boolean][] }[] = [
  { title: "Surfaces", about: "Crisp white sheets on a pale, cool page. Flat: a hairline, no shadow.", items: [["bg-background", "Page"], ["bg-card", "Sheet: cards, nav, tables"], ["bg-muted", "Sunken: hover rows, group rows"], ["bg-raised", "Pressed, skeleton"]] },
  { title: "Ink and lines", about: "Slate text. Hairlines divide; the edge outlines a button or chip; form fields keep a 3:1 border.", items: [["bg-foreground", "Ink", true], ["bg-muted-foreground", "Secondary ink", true], ["bg-border", "Hairline"], ["bg-edge", "Button and chip edge"], ["bg-input", "Form field border"]] },
  { title: "Accent", about: "The one accent, teal: what she can act on (links, primary buttons) and where she is (current item, focus).", items: [["bg-sky", "Accent: links, current, info", true], ["bg-sky-strong", "Accent hover", true], ["bg-mark", "Chart marks"], ["bg-wash", "Accent tint: unread, current"], ["bg-wash-line", "Line on the tint"], ["bg-ring", "Focus ring"]] },
  { title: "Signals", about: "Meaning only, always beside words that say it.", items: [["bg-leaf", "Success", true], ["bg-sun", "Warning", true], ["bg-ember", "Danger", true], ["bg-flame", "A bond of 3 years or more", true]] },
  { title: "Reach", about: "Each reach label's colour, best to worst: the ramp runs green, olive, amber, then grey.", items: [["bg-reach-reached", "Reached", true], ["bg-reach-later", "Only in a later (stray) round", true], ["bg-reach-within", "Within 10%", true], ["bg-reach-closed", "Closed before your rank", true], ["bg-reach-none", "No allotment to compare", true]] },
  { title: "Money, risk and result state", about: "Roles over the signals.", items: [["bg-fee-low", "Low fee, no bond", true], ["bg-fee-high", "High fee or penalty", true], ["bg-risk", "Be careful", true], ["bg-provisional", "Provisional result", true], ["bg-final", "Final result", true]] },
  { title: "College type", about: "Categorical, never ranked; each badge names its type.", items: [["bg-type-govt", "State government, municipal", true], ["bg-type-central", "Central government", true], ["bg-type-esic", "ESIC", true], ["bg-type-deemed", "Deemed university", true], ["bg-type-trust", "Trust", true]] },
];

const type = [
  { cls: "text-figure font-semibold", spec: "Figure 28/32, 600: stat tiles, the rank", sample: "42,284" },
  { cls: "text-h1 font-semibold", spec: "H1 28/36, 600: page titles (22px on phones)", sample: "Options" },
  { cls: "text-h2 font-semibold", spec: "H2 20/28, 600: page sections", sample: "Your rank vs Round 2's last rank by branch" },
  { cls: "text-title font-semibold", spec: "Title 16/24, 600: card titles", sample: "Round 2 result" },
  { cls: "text-body", spec: "Body 14/20, 400", sample: "Based on last years' closing ranks, not a prediction." },
  { cls: "text-caption text-muted-foreground", spec: "Caption 12/16, 400: notes, sources", sample: "MCC PG 2026 Round 2 allotment result (provisional)" },
  { cls: "section-label text-muted-foreground", spec: "Section label 12/16, 600, sentence case", sample: "Plan" },
];

const sample = [
  { name: "Sample Medical College, Pune", course: "MD Anaesthesiology", closing: "1,58,235", reach: "reached", label: "Reached in 2026 R1 to R2", fee: "₹30 L/yr", seats: "9" },
  { name: "Sample Government Medical College", course: "MS General Surgery", closing: "41,117", reach: "within", label: "Within 10% in a past round", fee: "₹1,71,462/yr", seats: "12" },
  { name: "Sample Institute of Medical Sciences", course: "MD Paediatrics", closing: "9,870", reach: "closed", label: "Closed before your rank", fee: "₹2,950/yr", seats: "—" },
] as const;

const Section = ({ id, title, about, children }: { id: string; title: string; about?: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="grid gap-3 border-t border-border pt-6">
    <div>
      <h2 id={id} className="text-h2 font-semibold">{title}</h2>
      {about && <p className="max-w-prose text-body text-muted-foreground">{about}</p>}
    </div>
    {children}
  </section>
);
const Sheet = ({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("grid content-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
    {title && <h3 className="section-label text-muted-foreground">{title}</h3>}
    {children}
  </div>
);

export default async function DesignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await staffUser())) notFound();
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "courses";
  const sort = typeof sp.sort === "string" ? sp.sort : "reach";
  const view = sp.layout === "table" ? "table" : "cards";
  const here = (p: Record<string, string>) => `/decide/design?${new URLSearchParams({ ...(sp.tab ? { tab } : {}), ...(sp.sort ? { sort } : {}), ...p })}`;
  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Design system" note="Staff only. Sample values, not data.">
        Clean and clinical: slate on white, one teal accent, IBM Plex Sans with tabular figures. Every token and shared component of the inside app, in its states.
      </PageHead>

      <Section id="colour-h" title="Colour" about="Read from this page, so the values are what the app draws. Text colours show their contrast; AA is 4.5:1.">
        <div className="grid gap-4 lg:grid-cols-2">
          {colours.map((g) => (
            <Sheet key={g.title} title={g.title}>
              <p className="-mt-2 text-caption text-muted-foreground">{g.about}</p>
              <ul className="grid divide-y divide-border sm:grid-cols-1">{g.items.map(([c, n, x]) => <Swatch key={c} cls={c} note={n} text={x} />)}</ul>
            </Sheet>
          ))}
        </div>
      </Section>

      <Section id="type-h" title="Type" about="IBM Plex Sans, one family: its figures are tabular by default, so every rank and fee column lines up; its l has a tail and its 1 a flag, so 1, l and I never read as each other. IBM Plex Mono for codes only.">
        <Sheet>
          <ul className="grid divide-y divide-border">
            {type.map((t) => (
              <li key={t.spec} className="grid gap-1 py-3 md:grid-cols-[16rem_1fr] md:items-baseline">
                <span className="text-caption text-muted-foreground">{t.spec}</span>
                <span className={t.cls}>{t.sample}</span>
              </li>
            ))}
          </ul>
        </Sheet>
        <div className="grid gap-4 md:grid-cols-3">
          <Sheet title="Weights">
            <p className="text-body">400 Regular for reading</p>
            <p className="text-body font-medium">500 Medium for labels and buttons</p>
            <p className="text-body font-semibold">600 Semibold for titles and key figures</p>
          </Sheet>
          <Sheet title="Tabular figures">
            <table className="w-fit text-body">
              <caption className="sr-only">Sample ranks, right-aligned</caption>
              <tbody>{["1,58,235", "42,284", "42,824", "9,870", "11,111"].map((n) => <tr key={n}><td className="py-0.5 text-right font-medium">{n}</td></tr>)}</tbody>
            </table>
          </Sheet>
          <Sheet title="Codes (mono)">
            <p className="text-body">MCC institute code <span className="font-mono">101458</span></p>
          </Sheet>
        </div>
      </Section>

      <Section id="space-h" title="Space, radius, elevation, focus" about="A 4px step (3.2px on phones, where the compact scale steps everything down; 44px touch targets stay 44px). Radii grow with the thing's size. Only what floats has a shadow.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Sheet title="Spacing (Tailwind steps)">
            <ul className="grid gap-1.5">
              {[["1", "w-1"], ["2", "w-2"], ["3", "w-3"], ["4", "w-4"], ["6", "w-6"], ["8", "w-8"], ["12", "w-12"], ["16", "w-16"]].map(([n, w]) => (
                <li key={n} className="flex items-center gap-3 text-caption text-muted-foreground"><span className="w-6 text-right">{n}</span><span className={cn("h-3 rounded-sm bg-mark", w)} /></li>
              ))}
            </ul>
          </Sheet>
          <Sheet title="Radius">
            <div className="flex flex-wrap gap-3">
              {[["rounded-sm", "4: badge"], ["rounded-md", "8: control"], ["rounded-lg", "10: popover"], ["rounded-xl", "12: sheet"], ["rounded-2xl", "16: dialog"], ["rounded-full", "pill"]].map(([r, n]) => (
                <span key={r} className="grid justify-items-center gap-1 text-caption text-muted-foreground"><span className={cn("size-14 border border-edge bg-muted", r)} />{n}</span>
              ))}
            </div>
          </Sheet>
          <Sheet title="Elevation">
            <div className="flex flex-wrap gap-4 bg-background p-4">
              <span className="grid h-16 w-32 place-items-center rounded-xl border border-border bg-card text-caption">Sheet: hairline</span>
              <span className="grid h-16 w-32 place-items-center rounded-md border border-edge bg-card text-caption shadow-xs">Control: xs</span>
              <span className="grid h-16 w-32 place-items-center rounded-lg border border-border bg-popover text-caption shadow-overlay">Floating: overlay</span>
            </div>
          </Sheet>
          <Sheet title="Focus ring">
            <p className="text-caption text-muted-foreground">2px accent outline, 2px off the control, on every focusable thing (keyboard only).</p>
            <div className="flex flex-wrap items-center gap-4">
              <Button className="outline-2 outline-offset-2 outline-ring">Focused button</Button>
              <a href="#space-h" className="text-sky underline outline-2 outline-offset-2 outline-ring">Focused link</a>
            </div>
          </Sheet>
        </div>
      </Section>

      <Section id="buttons-h" title="Buttons and badges">
        <div className="grid gap-4 lg:grid-cols-2">
          <Sheet title="Button">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary">Small (36px)</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" variant="secondary" aria-label="Edit (icon button)"><Pencil className="size-4" aria-hidden /></Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </div>
          </Sheet>
          <Sheet title="Badge">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Neutral</Badge><Badge tone="info">Info</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="error">Error</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="reached">Reached in 2026 R1 to R2</Badge><Badge tone="later">Reached only in stray rounds</Badge><Badge tone="within">Within 10% in a past round</Badge><Badge tone="closed">Closed before your rank</Badge><Badge tone="none">No allotment in your categories</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Provisional when /><Badge tone="final">Final</Badge>
              {(["govt", "central", "esic", "deemed", "trust", "private"] as const).map((t) => <TypeBadge key={t} type={{ value: t, basis: "inferred: sample for the styleguide" }} />)}
            </div>
            <p className="flex items-center gap-1 text-caption text-muted-foreground">The colour key, as pages show it: <ColourLegend /></p>
          </Sheet>
        </div>
      </Section>

      <Section id="controls-h" title="Controls and the toolbar" about="A list page has one toolbar: search, Filters (a sheet), Sort and View. Pinned under the top bar on phones.">
        <FilterForm action="/decide/design" role="search" aria-label="Sample toolbar" className={toolbar}>
          <ToolbarSearch>
            <label className="min-w-0">
              <span className="sr-only">Search (sample)</span>
              <input type="search" name="q" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder="Search" className={control} />
            </label>
          </ToolbarSearch>
          <FiltersPanel count={2} clear="/decide/design" total={916}>
            <FilterSection title="State" none="All states" info="Sample section: the sheet's sections fold, one open at a time.">
              {["Karnataka", "Kerala", "Tamil Nadu"].map((s) => <label key={s} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="st" value={s} className="size-5 accent-sky" />{s}</label>)}
            </FilterSection>
            <Field label="Seats">
              <select name="seats" defaultValue="all" className={control}>
                <option value="all">With or without seats</option>
                <option value="clear">Clear vacancy</option>
              </select>
            </Field>
          </FiltersPanel>
          <SortMenu value={sort} choices={[{ value: "reach", label: "Reach (reached first)", short: "Reach", href: here({ sort: "reach" }) }, { value: "closing", label: "Closing (deepest first)", short: "Closing", href: here({ sort: "closing" }) }, { value: "fee", label: "Fee (lowest first)", short: "Fee", href: here({ sort: "fee" }) }]} />
          <LayoutMenu page="design" view={view} />
          <ToolbarCount total={916} noun="options" />
        </FilterForm>
        <div className="grid gap-4 lg:grid-cols-2">
          <Sheet title="Fields">
            <Field label="Category"><select defaultValue="OBC" className={control}><option>Open</option><option>OBC</option><option>SC</option></select></Field>
            <Field label="Rank"><Input inputMode="numeric" defaultValue="42,284" /></Field>
            <Field label="Invalid"><Input aria-invalid defaultValue="abc" /></Field>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" defaultChecked className="size-5 accent-sky" />A checkbox</label>
          </Sheet>
          <Sheet title="Chips and tabs">
            <nav aria-label="Sample chips" className="flex flex-wrap gap-2">
              <a href="#controls-h" aria-current="true" className={chip(true)}>All <span className="font-semibold">916</span></a>
              <a href="#controls-h" className={chip(false)}>Reached <span className="font-semibold">425</span></a>
              <a href="#controls-h" className={chip(false)}>Within 10% <span className="font-semibold">155</span></a>
            </nav>
            <SubTabs label="Sample tabs" current={tab} items={[{ key: "courses", label: "Courses", href: here({ tab: "courses" }) }, { key: "fees", label: "Fees & bond", href: here({ tab: "fees" }) }, { key: "residents", label: "Residents", href: here({ tab: "residents" }), accent: true }]} />
            <p className="flex items-center gap-1 text-body">
              An explanation behind an (i)
              <InfoTip label="the sample tip">The (i) is a real button; its panel opens on click or tap, never on hover, and closes on Escape or a tap outside.</InfoTip>
            </p>
          </Sheet>
        </div>
      </Section>

      <Section id="data-h" title="Tables, cards and figures" about="Tables: a pinned header, no zebra, hairline rows, figures right-aligned. Sample values, not data.">
        <ScrollTable label="Sample options table">
          <table className={tbl.table}>
            <caption className="sr-only">Sample options (styleguide)</caption>
            <thead className={tbl.head}>
              <tr className="text-left">
                <th scope="col" className={tbl.th}>Institute and course</th>
                <th scope="col" className={cn(tbl.th, "text-right")}>2026 R2 closing</th>
                <th scope="col" className={tbl.th}>Reach</th>
                <th scope="col" className={cn(tbl.th, "text-right")}>Fee</th>
                <th scope="col" className={cn(tbl.th, "text-right")}>R2 clear</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((r) => (
                <tr key={r.name} className={tbl.row}>
                  <th scope="row" className={cn(tbl.td, "text-left font-normal")}><span className="block font-semibold">{r.name}</span><span className="text-muted-foreground">{r.course}</span></th>
                  <td className={tbl.num}>{r.closing}</td>
                  <td className={tbl.td}><Badge tone={r.reach}>{r.label}</Badge></td>
                  <td className={tbl.num}>{r.fee}</td>
                  <td className={tbl.num}>{r.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultCard
            title="Sample Medical College, Pune"
            href="#data-h"
            chips={[<Provisional key="p" when />]}
            stat={{ label: "2026 R1 closing", value: "1,58,235" }}
            subtitle="MD Anaesthesiology"
            meta={["Maharashtra", <TypeBadge key="t" type={{ value: "deemed", basis: "inferred: sample" }} />]}
            footer={<p className="px-4 py-2.5 text-sm"><span className="font-semibold text-fee-high">₹30 L/yr</span> · stipend <span className="font-semibold">₹25,000/mo</span> · <span className="font-semibold text-risk">Be careful</span>: bond not known</p>}
          />
          <StatStrip
            items={[
              { label: "Options in your profile", value: "3,250", note: "Sample" },
              { label: "Reached your rank", value: "425", info: "Sample tile: what the number counts goes behind its (i)." },
            ]}
          />
        </div>
      </Section>

      <Section id="states-h" title="Notices, empty and loading">
        <div className="grid gap-3">
          <NoticeStrip id="design-sample" text="Sample MCC notice" href="#states-h" />
          <p role="note" className="flex items-center gap-2 rounded-lg border border-wash-line bg-wash px-3 py-2.5 text-sm"><span className="font-semibold">News strip</span> the accent tint: a result is out, unread.</p>
          <p role="note" className="rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm"><span className="font-semibold">Caution strip</span> something on the page needs her eye (a cap hides options).</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState title="No options match" description="Nothing here matches “sample”. Clear the search or the filters." icon={SearchX} href="/decide/design" action="Clear search" headingLevel={3} />
          <div className="grid gap-3">
            <SkStats n={2} />
            <SkTable rows={2} cols={4} />
          </div>
        </div>
        <SkCards n={2} />
      </Section>

      <p className="text-caption text-muted-foreground">
        Rules and rationale: docs/APP_DESIGN_SYSTEM.md. Pages on the system: <Link href="/decide" className="text-sky underline">Home</Link>, <Link href="/decide/options" className="text-sky underline">Options</Link>.
      </p>
    </AppPage>
  );
}
