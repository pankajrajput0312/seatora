# Seatora Inside App Design System: "Case sheet" (Decide)

The landing page, privacy and auth pages use the dark roook-style system in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Everything under `/decide` uses this one, a light, data-first system built on **[Astryx](https://github.com/meta/astryx)**, Meta's open-source design system (`@astryxdesign/core`, `theme-neutral`). The two never share a page.

## Why it looks like this
The user is a doctor working through a live counselling round, so the app reads like a hospital **case sheet**: chart paper, white sheets, navy ink, ruled hairlines, one chart-ink blue. Numbers are the content. They are set in **Atkinson Hyperlegible Next** (Braille Institute), whose glyphs are built so that similar characters can't be confused, so a rank like 42,284 never reads as 42,824.

## Tokens
Scoped by the `.app` wrapper and by `.app [data-astryx-theme]`, both in `src/app/globals.css`. Shared components (Button, Badge, Input…) use the same token classes and restyle automatically.

| Role | Value | Tailwind / Astryx |
|---|---|---|
| Chart paper (page) | `#f3f6f9` | `bg-background` / `--color-background-body` |
| Sheet (cards, nav) | `#ffffff` | `bg-card` / `--color-background-surface` |
| Ink | `#102231` | `text-foreground` / `--color-text-primary` |
| Secondary ink | `#53657a` | `text-muted-foreground` / `--color-text-secondary` |
| Ruled hairline | `#d9e1e9` | `border-border` / `--color-border` |
| Chart-ink blue (text, links, accent) | `#1c5cab` | `text-sky` / `--color-accent` |
| Chart-ink blue (marks) | `#2a78d6` | `--color-mark` |
| Good / warning / critical (text-safe) | `#0a7a0a` / `#8a5a00` / `#c03030` | `text-leaf` / `text-sun` / `text-ember` |

Fonts: `--font-app`, which is Atkinson Hyperlegible Next, used for body, headings and numbers alike. There's no pixel or monospace face inside the app.

## Layout
- Astryx `AppShell` (`height="auto"`, `variant="section"`): the sticky `TopNav` carries the brand, the Compare tray button ("2/4", only when the tray has items; on phones it is a fourth item in the bottom bar) and "Back to site"; `SideNav` holds the rank "patient band" card plus 11 items in Plan, Research and Counselling groups (Lucide icons). Astryx provides the skip link, the main landmark and the mobile drawer. On phones there's also a bottom bar with Options, Choices and Rank scan. Nothing floats over the page, and `scroll-padding` (globals.css) sits above the header and bottom-bar heights, so a focused control is never hidden.
- The profile dialog renders inside `.app` (no portal), so it uses these tokens. 404 (`decide/not-found.tsx`), errors (`decide/error.tsx`) and "Data unavailable" (no database) render in the shell as an `EmptyState`.
- Content is left-aligned and divided by ruled hairlines and sheets, never floating shadowed cards. Headline numbers sit in one ruled **stat strip** (`StatStrip`), not as separate cards.
- Labels are sentence case. There are no all-caps eyebrows and no monospace labels.

## Charts (dataviz skill)
- Use the emphasis form: one accent (chart-ink blue) plus grey context. There are no categorical multi-hue series, because the palette validator failed our 4-hue set for colour-blind readers.
- Marks use `--color-mark` (`fill-mark`, `stroke-mark`, `bg-mark`); `sky` is for text and links. 2px lines, ≥8px markers with a 2px ring in the surface colour, bars at most 24px thick with a 4px rounded end. Grid lines are solid hairlines.
- Every chart has a legend when there are 2 or more series, selective direct labels, hover tooltips (value first, then label), and a "Show as table" view (`ChartCard`). A chart is one `role="img"` with a summary label; its marks are not tab stops (the strip has hundreds), the table view carries the numbers. Table views summarise (per course: count, deepest, median, shallowest) rather than list every option; the full list is the Options page.
- The memorable element is the **"Where your rank sits"** strip chart on faint ECG-style grid paper (`.chart-paper`), with the doctor's rank as the cursor line. Everything else stays quiet.
- Big standalone numbers use proportional figures. Table columns use `numeric` (tabular).

## Inside-app primitives (`src/features/decide/components`)
- `AppPage`: page frame (`min-w-0`; for grid pages use `grid grid-cols-1 gap-6`). `PageHead`: the h1 (`#main-h1`, focusable) and intro.
- `FilterBar` + `Field` + `Select` + `control` (ui.tsx): GET filter forms that keep the profile; Apply keeps focus. `FilterDropdown`: multi-select pill (one open at a time, closes on Escape and focus-out).
- `tbl` (ui.tsx): table classes; numbers right-aligned in `numeric`. `Pager` + `rangeLabel`: server-side pages, focus moves to the results heading. `StatStrip` / `StatCell`: headline numbers.
- `EmptyState` (ui.tsx, Astryx EmptyState on a dashed sheet): the one empty, no-results, not-found and unavailable state, with a heading and an action. `SetRankPrompt` uses it.
- `DataSource`: provenance under every data block, from the data (MCC result PDFs per year and round, term documents). `TermText`: a fee, stipend, bond or seat-leaving penalty exactly as published, with its source link. `termLabel` (types.ts) names them; PENALTY is "Resign or don't join from Round 2 (MCC)", MCC's forfeit: never "bond penalty" or "seat-leaving penalty" (that is the college's penalty for leaving the course, inside the bond).
- Fees (`components/fees.tsx`, from `ProgrammeTerms`, server/terms.ts): `FeesSection` (one programme: Year table, a 2-year course has no year 3; whole-course fee marked as computed from one yearly figure; Service bond / Applies to / Leaving the course after joining / Resign or don't join from Round 2; exact words in a closed details; numbered sources, each superscript a link named "Source N: …" so its name starts with the number shown), `TermsSummary` (one line: fee/yr · stipend yr 1 · bond yrs, ₹ · leaving ₹; "not declared" when missing, "see terms" when declared in words only, "+ more" when part is in words; the same bond figure as the Fees page, e.g. "up to ₹30 L (₹10 L × 3 yrs, computed)") for Options, Seats and Allotments rows (get each row's terms with `termsForCourses` in service.ts) and the college Overview, `amountText` / `amountNote` (a bond or leaving `Amount`: range by course type, per-year × years, varies by specialty), `Money` (full Indian grouping, with NBEMS fee / minimum / NMC list markers), `NotDeclared` ("—" read as "not in our MCC data"). Missing is never "no bond", and never asserted about MCC itself: DNB and NBEMS Diploma say "No bond declared to MCC in the profile fields Seatora imports" with the NBEMS rule and its notices, MD/MS and Diploma "Not declared on MCC in the profile fields Seatora imports" with the state-bond caution, other missing values "Not in Seatora's MCC data yet". A source from an MCC profile that several institutes cite says it may be another institute's; one filed under the other MD/DNB bucket says so.
- Fees page (`/decide/fees`): a sortable table from md up (sticky institute column; header links read "Sort by …", the arrow is aria-hidden), one card per row below md (fee and stipend year 1, bond, leaving; sorting by the Sort by select). The less-used filters fold on phones behind "Show all filters" (an unnamed checkbox, `.more-toggle` / `.more-filter` in globals.css). Bond and leaving cells: the highest ₹ figure with what it leaves out, "In words" (declared without a ₹ figure, linking the Fees tab), or "—".
- `Provisional` (bits.tsx): the one warning marker, shown only when the data's source is provisional (`Source.provisional`, `GridCell.provisional`, `Deepest.provisional`); never tied to a year. `ReachBadge`, `Closing` (closing rank with its round and seat category), `Dash` ("—" with sr-only "not available").
- `SubTabs`: link sub-navigation. `smallLink`: a 44px-tall link for notes and cross-links. Counts and ranks go through `formatRank` (Indian grouping).

## Adding inside-app UI
Prefer Astryx components (`npx @astryxdesign/cli component <Name>` for docs): Decide uses AppShell, SideNav, TopNav and EmptyState; tables, selects and filter bars are the Seatora primitives above. Where an existing Seatora component already fits, reuse it; the scoped tokens restyle it. Astryx CSS is imported only in `src/app/decide/layout.tsx`, but it stays loaded after a client navigation back to the site, so `globals.css` restates the site's `:root` border and colour scheme after the Astryx layers. Buttons: see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (md and icon are 44px).
