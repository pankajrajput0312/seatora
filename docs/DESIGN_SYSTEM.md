# MEDPATH Design System: Dark Instrument (after roook.space)

This is the single source of truth for visual design. Tokens are implemented in `src/app/globals.css` under `@theme`. Tailwind's default palette and shadows are **disabled**, so only the tokens below exist as classes.

The reference is [roook.space](https://roook.space): a near-black, cool-tinted interface with a precise sans, a pixel display face and small bright signal colours. It should read as a calm, technical instrument. Information comes first, and colour means something.

## Principles
1. **Dark and cool.** Surfaces step up in lightness (background → card → muted → accent), not through shadows.
2. **Hairlines over boxes.** Borders are translucent white (8–11%), so they disappear into the surface.
3. **Monochrome first.** UI is white on near-black. Colour appears only as a signal (status, source tier, a chart series).
4. **One expressive element per view.** The pixel font is used for the wordmark, section-closing display headlines, the tinted-card labels and big numbers, and nowhere else.

## Prohibited
Gradient fills on cards or text (the exceptions are listed under Signature elements) · purple/blue "AI" gradients · decorative blobs · coloured shadows · light-mode islands inside the dark UI · signal colours used for decoration · more than one pixel-font element per region · entrance animations, parallax, bouncing · illustrations that carry no information.
Backdrop blur is allowed **only** on the sticky header (`bg-background/80 backdrop-blur-md`).

## Colour tokens (OKLCH)

| Token | Class suffix | Value | Use |
|---|---|---|---|
| Background | `background` | oklch(14% .01 240) | Page |
| Card | `card` | oklch(18.5% .01 240) | Cards, inputs, tables |
| Popover | `popover` | oklch(19% .015 250) | Dropdowns, dialogs |
| Muted | `muted` | oklch(22% .014 250) | Hover fills, skeletons, neutral badges |
| Secondary | `secondary` | oklch(23% .016 250) | Secondary buttons |
| Accent | `accent` | oklch(25% .018 250) | Hover on secondary, selected rows |
| Foreground | `foreground` | oklch(96% .006 240) | Primary text, headings |
| Muted foreground | `muted-foreground` | oklch(70% .012 240) | Supporting text, meta, placeholders |
| Primary | `primary` / `primary-foreground` | 96% / 16% | Primary button (light fill, dark text) |
| Border | `border` | white / 8% | Dividers, card outlines |
| Input | `input` | white / 11% | Input and secondary-button borders |
| Ring | `ring` | sky / 60% | Focus ring |

**Signal colours**, used for meaning only:

| Token | Value | Meaning in MEDPATH |
|---|---|---|
| `sky` | oklch(80% .12 222) | Info, links, focus, verified institutional |
| `leaf` | oklch(78% .19 145) | Success, **Official** source |
| `sun` | oklch(87% .17 95) | Warning, unverified, outdated, demo data |
| `ember` | oklch(65% .23 27) | Error, destructive, validation |

Tinted fills use 10% opacity with the full colour for text (`bg-leaf/10 text-leaf`).
Chart series are drawn in this order: `foreground`, `sky`, `leaf`, `sun`. Use at most four, and use `muted-foreground` for gridlines at low opacity.

## Typography
- **Geist Sans** (`font-sans`, default): all interface and body text. Weights 400, 500 and 600.
- **Geist Pixel Square** (`font-pixel`): the wordmark, the hero headline, and large statistics (for example the closing rank on a profile). Never use it for body text or anything under 24px except the wordmark.
- **Geist Mono** (`font-mono`): source identifiers, codes, table metadata.
- **Tabular numerals**: the `numeric` utility on every rank, fee, stipend, seat count and statistic.

| Role | Class |
|---|---|
| Display | `font-pixel text-5xl md:text-7xl leading-none` |
| H1 | `text-4xl font-semibold tracking-tight` |
| H2 | `text-2xl md:text-3xl font-semibold tracking-tight` |
| H3 | `text-lg font-medium` |
| Body | `text-base leading-relaxed text-muted-foreground` |
| UI / table | `text-sm` |
| Eyebrow | `font-mono text-xs uppercase tracking-widest text-muted-foreground` |
| Caption | `text-xs text-muted-foreground` |

Headings use `foreground`. Body copy usually uses `muted-foreground`, with emphasis in `foreground`. Maximum text width is `max-w-prose`.

## Spacing and layout
Tailwind's 4px scale; use 1, 2, 3, 4, 6, 8, 12, 16 and 24. Card padding is `p-4` (compact) or `p-6`. Section rhythm is `py-16 md:py-24`.
Containers: `max-w-content` (72rem) through `Container` with `px-5 md:px-8` gutters, and `max-w-prose` (42rem) for reading.

## Radius
Base radius is 0.75rem. `rounded-sm` .45rem (badges) · `rounded-md` .6rem (buttons, inputs) · `rounded-lg` .75rem (cards) · `rounded-xl` 1rem (dialogs, large panels). `rounded-full` is for avatars, dots and pill toggles only.

## Elevation
Elevation comes from lightness steps, not shadows. The only shadow is `shadow-overlay`, used for popovers and dialogs.

## Motion
150ms with `cubic-bezier(.4,0,.2,1)` on colour, opacity and transform only. `animate-pulse` is for skeletons, status dots and spinners (`animate-spin`). On the landing page only, `marquee` / `marquee-slow` and `bob` are also allowed (see below). `prefers-reduced-motion` disables all motion globally.

## Signature elements (landing page)
Adapted from roook.space. Utilities are defined in `globals.css`. Use these on marketing pages only, never in research or data views.
- **Scanlines**: a fixed `body::before` overlay at 1.8% white, always on and never interactive.
- **Hero vignette**: a single radial gradient from `muted` at the top of the hero.
- **Pixel emblem** (`PixelEmblem`): an SVG generated with Bayer-dithered pixels (sky ring, accent disc, leaf cross; never a red cross), floating with `bob`. It is flanked by a query chat bubble (`bg-secondary rounded-full`) and a status pill (`bg-primary` with a pulsing sky dot).
- **Question marquee**: three rows of real aspirant questions. The middle row is large and sharp; the outer rows are small, 50% opacity and blurred 1.5px, with the bottom row reversed. Edges fade with `mask-x`. Rows are `aria-hidden`, with an `sr-only` list for screen readers.
- **Tinted halftone cards**: four signal-colour cards (ember, sky, sun, leaf) with the `halftone` dot overlay and a pixel-art picture of the factor (rising bars, ECG trace, coin stacks, clock) generated on a 24×16 grid, labelled in pixel type in the matching colour. A single `glow-strong` pixel headline overlays them on `md+` and sits above them on mobile.
- **Resident finder** (`features/residents/components/resident-finder.tsx`): the main landing section. Residents are grouped into one card per hospital or college, with a Lucide `Hospital` icon, the state and a resident count. Each resident shows their name, AIR, category, quota, course and year, plus labelled contact buttons (WhatsApp, Call, Email, Instagram, LinkedIn) as secondary-style chips. Search covers college, state, course and name. An optional rank orders hospitals and residents by closeness and adds a leaf, sun or ember badge. When the list is empty it shows "No residents added yet" rather than demo data.
- **Feature tiles** (`feature-tiles.tsx`): a grid of mini product previews instead of icon-and-text cards. These are SVG line charts, a seat heatmap, bars, pixel meters, a compare table, a profile card, a shortlist and a round tracker, built with plain SVG and divs (no chart library). The section carries one "demo data" badge.
- **Text glow**: `glow` on pixel display headlines only.
- **Footer wordmark**: a giant pixel "medpath" at 6% foreground, fading out at the bottom.
- **Logo mark** (`LogoMark`, `app/icon.svg`): a 9×9 pixel ring with a cross.

## Components (`src/components/ui`, built on Radix)
Icons are Lucide, `size-4` in UI, with `strokeWidth={1.75}` and `currentColor`.

- **Button.** `primary`: light fill (`bg-primary text-primary-foreground`), 90% on hover, at most one per region. `secondary`: `bg-secondary border-input`, accent on hover. `ghost`: muted text, muted fill on hover. Sizes are sm 32px, md 40px and lg 48px. Disabled is 50% opacity.
- **Input.** `bg-card border-input rounded-md h-10`. Focus sets a sky border plus the ring. Invalid sets `aria-invalid` (ember border) and shows a `text-xs text-ember` message below. Labels are visible, above the field.
- **Card.** `rounded-lg border border-border bg-card p-6`. On hover, interactive cards get `bg-muted`. Content order: title, mono meta line, numeric data rows, then the source label.
- **Navigation.** Sticky, 64px, translucent with blur, bottom hairline. Pixel wordmark on the left, at most 4 links in `muted-foreground` (the active one in `foreground`), with actions on the right. On mobile it becomes a Radix Dialog sheet.
- **Table.** `bg-card` with a border. The header uses the eyebrow style. Rows are 44px with hairline dividers and `hover:bg-muted`. Numeric cells are right-aligned and `numeric`. A footer carries the source.
- **Badge.** `rounded-sm px-2 py-0.5 text-xs font-medium`. Tones: neutral (muted), info (sky), success (leaf), warning (sun), error (ember).
- **SourceLabel.** The tier badge (Official = leaf, Verified institutional = sky, Unverified = sun, others neutral), the source name linked in sky, and the academic year in mono. Required beside sourced data.
- **Tabs.** Radix. A hairline under the list; the active tab is `foreground` with a 2px foreground underline. Scroll horizontally on mobile.
- **Dialog.** Radix. `bg-popover rounded-xl shadow-overlay p-6 max-w-lg`. Overlay is `bg-black/60`.
- **Dropdown / Select.** Radix. `bg-popover border-border rounded-md shadow-overlay`. Items are 36px with `hover:bg-muted`, and the selected item shows a Lucide `Check`.
- **Empty state.** Centred, with a `text-muted-foreground` icon, an H3 and one line, plus one action. Be honest about missing data.
- **Loading.** Skeletons in `bg-muted animate-pulse` matching the final layout. Buttons show a `Loader2` spinner and are disabled.
- **Error.** Inline uses `text-ember`. At region level, a card with an ember `AlertCircle`, a plain-language message and a retry action.
- **Demo-data banner.** `bg-sun/10 text-sun` badge reading "Demo data — illustrative only".

## Responsive
Mobile first. `md` 768px brings navigation and two columns; `lg` 1024px brings the filter sidebar and three columns. On mobile, tables scroll inside a bordered wrapper or become stacked cards, and filters move into a sheet. Touch targets are at least 44px.

## Accessibility (WCAG 2.2 AA)
- `foreground` on `background` is about 17:1 and `muted-foreground` is about 7:1. Signal colours pass on dark backgrounds at `text-sm` and above.
- Never rely on colour alone; badges always include text.
- Show a visible focus ring (`ring`) on every interactive element, use semantic landmarks, and have one `h1` per page.
- Labelled fields, with errors linked by `aria-describedby`.
- Charts get a table or text alternative.
