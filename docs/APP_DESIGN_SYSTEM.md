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
- Astryx `AppShell` (`height="auto"`, `variant="section"`): the banner slot holds the demo notice, `TopNav` carries the brand and "Back to site", and `SideNav` holds the rank "patient band" card plus the 8 section tabs (Lucide icons). Astryx provides the skip link, the main landmark and the mobile drawer. On phones there's also a bottom bar with Options, Choices and Rank scan.
- Content is left-aligned and divided by ruled hairlines and sheets, never floating shadowed cards. Headline numbers sit in one ruled **stat strip** (`StatStrip`), not as separate cards.
- Labels are sentence case. There are no all-caps eyebrows and no monospace labels.

## Charts (dataviz skill)
- Use the emphasis form: one accent (chart-ink blue) plus grey context. There are no categorical multi-hue series, because the palette validator failed our 4-hue set for colour-blind readers.
- Marks: 2px lines, ≥8px markers with a 2px ring in the surface colour, bars at most 24px thick with a 4px rounded end. Grid lines are solid hairlines.
- Every chart has a legend when there are 2 or more series, selective direct labels, hover and focus tooltips (value first, then label), and a "Show as table" view (`ChartCard`).
- The memorable element is the **"Where your rank sits"** strip chart on faint ECG-style grid paper (`.chart-paper`), with the doctor's rank as the cursor line. Everything else stays quiet.
- Big standalone numbers use proportional figures. Table columns use `numeric` (tabular).

## Adding inside-app UI
Prefer Astryx components (`npx @astryxdesign/cli component <Name>` for docs). Where an existing Seatora component already fits, reuse it; the scoped tokens restyle it. Don't import Astryx CSS outside `src/app/decide/layout.tsx`.
