# Data Integrity

Seatora informs decisions that shape doctors' careers. Wrong data is worse than missing data.

## Absolute rules
1. **Never fabricate** college data, cutoffs, seats, fees, stipends, bonds, rankings, reviews, testimonials, user identities or announcements.
2. **Demo data must be labelled** visibly in the UI as "Demo data — illustrative only", and it lives in clearly named files (`*.demo.ts`). Decide has none at runtime: its fixture (`features/decide/test/decide.demo.ts`) is imported by tests only, and with no database Decide shows "Data unavailable", never stand-in numbers.
3. **Historical is not predictive.** Cutoffs and rank-based results always say they come from previous years and do not guarantee admission. Do not use words like "guaranteed", "you will get" or "chance %" unless a validated statistical method is documented.
4. **Missing data is shown as missing** ("—" or "Not available"), never as 0 and never estimated silently.
5. **No invented scores.** Do not create composite "college scores" or rankings unless the method is documented and sourced.

## Required provenance
Every important record must support (`src/types/provenance.ts`, `DataSource` in Prisma):

| Field | Notes |
|---|---|
| Source name | e.g. "MCC Round 2 Allotment PG 2025" |
| Source URL | Official document URL where available |
| Source type | Trust tier (below) |
| Academic year | `YYYY-YY` |
| Counselling year | `YYYY` |
| Last verified timestamp | When a human or automated check last confirmed it |
| Verification status | VERIFIED · PENDING · DISPUTED · OUTDATED |
| Category / quota / round | Required for cutoffs and seat matrices |

### Provenance one click away (Decide)
Every Decide page that shows data (the Residents tab and page included; not Request a feature, which holds only what people send, nor Counselling, whose every row is itself an official document's link) ends with one collapsed **"Sources (N)"** footer (`AppPage` renders `PageSourcesFooter`, `components/page-sources.tsx`): each document the page's blocks cite, once, numbered 1…N in the order the page first cites it, with its trust-tier badge, its link (the MCC result PDFs as one entry a year, a link a round, Provisional marked) and its note. A block shows only its numbers ("Sources 1, 2" from `DataSource` / `SourceRefs`; a figure's superscript `SourceRef`, named "Source N: …"); each number opens the footer at its entry and moves focus there. Explanations of a figure (how it is counted, its exact published words, caveats) sit behind an (i) `InfoTip`, never only on hover; what a figure must say in view stays in view: "Provisional", "history, not a prediction" (`HistoryNote`), "NBEMS max" / "min", "state rule", later MCC seat notices to check, and "—" for missing. On paper the footer prints open.

### One definition per figure (Decide)
- **Deepest closing** is the highest closing rank among the rounds counted, Stray and special stray included (`lib/reach.ts` `deepestOf` / `deepestByYear`), on every screen (Seats cards and table, Options, Compare, Home, the institute pages), always with its year and round ("Deepest 2025: 60,351 (Stray)"). A figure that leaves Stray out (a reach label's evidence: "reached" counts R1 to R3 only) says "deepest before Stray" and gives Stray as its own number beside it.
- **Fee basis**, stated once, in the cell (`lib/stat-format.ts` `feeBasis`): "₹1.25 L/yr" a fee a year (MCC's "At admission" amount counts as year 1 of it when every later year is the same yearly figure); "₹1.25 L at admission (Year 1)" when later years differ or are not stated (MCC's form never says it is one-time: no screen says "not a yearly fee"); "₹3.75 L for the course" the whole course. Stipends always carry their period ("/mo"). One money style on cards for fees, stipends and penalties: lakh / crore from ₹1 L ("₹1.25 L", cut, never rounded up), full Indian grouping under it ("₹43,000", never "₹43k"); full figures in tables and (i)s. A ₹ range says why beside it ("depends on specialty") where the record prices it by specialty.

### Unknown stays unknown (Decide stat cells and filters)
The stat cells (Fee | Stipend | Bond | Bond ₹ | Leaving, `lib/stat-format.ts`) and the term filters (`lib/term-filters.ts`) read the same records and must agree. A cell is "—" when the value is not in the data, "In words" (Fee) or "See text" when it is given only in words, and a bond with no answer says which, in every cell, filter label and Compare: "None declared" (nothing declared to MCC), "Not clear" (read, no clear bond), "Doc not read" (NEET SS / MDS: MCC lists a bond document Seatora has not read) or "Law may apply" (a no-bond document where a state law's service may still apply); an amount declared without a figure is "Not stated". "No bond" is shown only where the college's document or the NBEMS rule says so, never for a missing record; with "Include not published" the No bond filter lists the ones without an answer too. A penalty priced from the fee ("tuition for the remaining course") uses the course's own fee where the record lists one per course (`fee_variants`); priced from a range across courses it is "Varies by course", the dearest course's figure only in its (i).
- A filter never passes an unknown value silently. The row is left out and counted ("N not declared left out: include them"), and it comes back only with "Include not declared" (`nd=keep`). No bond (`bondyrs=0`) lists only records that say no bond.
- NBEMS maximum fees ("≤ ₹1.25 L", marked "NBEMS max") and minimum stipends ("min") are labelled so and are never shown or filtered as the college's own figure. Inside a cap such a figure passes, because the college's own figure can't be past it. Outside the cap the college's figure is unknown. A declared figure above the maximum or below the minimum is marked "above NBEMS max" / "below NBEMS min".
- A type filter never passes a college with no type. A college type is inferred from its name and quota, or comes from Seatora's research, and its badge's (i) says which. It is never presented as official.

## Trust tiers
| Tier | Example | UI treatment |
|---|---|---|
| **Official** | MCC, state DME/DMER, NBEMS, NMC notifications | "Official" (success badge) |
| **Verified institutional** | College website or prospectus, confirmed by Seatora | "Verified institutional" (teal) |
| **Third-party research** | News, compiled datasets | "Third-party research" (neutral) |
| **Student-reported** | Resident reviews with an identity check | "Student-reported" (neutral), clearly an opinion |
| **Unverified community** | Forum or community submissions | "Unverified" (warning) |

Official information and reported experiences are never mixed in the same block. Profiles show them in separate, labelled sections.

## Reviews
- Do not create a review unless a real person submitted it. Placeholder reviews must say "Illustrative example".
- Only label a review "verified" after an actual verification step has been completed and recorded in DataVerification.
- Show the review date and residency year. Do not show a real name without consent.

## Residents list
- Residents are added by hand to `src/features/residents/data/residents.json`, and every entry must have `consent: true`, covering their name and every contact detail listed. Never list a real person or their phone number, email or social handle without their agreement, and never invent residents.
- Entries show "Resident-reported" unless `verified: true`, which may only be set after checking the allotment letter.
- A resident's rank is shown as where one person got in, not as a closing rank or a prediction.

## Admitted-list residents (Decide institute "Residents" tab, and Residents across colleges)
- Names come only from MCC's official admitted-candidates lists (`Resident`, imported from a private bundle that never enters git), with the list PDF as source. Name, course, year, list and, where known, the rank: the All India Rank from that year's NBEMS NEET PG result (2023, 2024, 2025), shown as "AIR 12,345 · 2024" with that result as a source (its official URL). Both documents are in the page's Sources footer, and what the rank is (and is not) sits behind an (i). No roll numbers, and no contact details are held or shown. Quota and round come from the matching MCC allotment of the same year, only where exactly one matched the rank, college and course; a reservation category (seat or candidate) is never held or shown (the import rejects a bundle carrying one).
- Who sees them: any signed-in member (with `SEATORA_OPEN_ACCESS=1` anyone can create a free account; else invited accounts only), never signed-out visitors or search engines. They are MCC's public admitted lists. The privacy notice and the Residents (i) say so, and how to have a name hidden: Hide beside it, or email the contact address (hidden for every year and course at that college, kept hidden after re-imports).
- Shown for choosing a college, with the caption "contact people respectfully; ask to be hidden and we will": per institute, and across colleges at `/decide/residents` (no API across colleges), 50 at a time up to page 20, with no CSV or bulk export, and a daily read cap per account (see ARCHITECTURE "Access gate"). Responses are `Cache-Control: private, no-store`, and both are `noindex`.
- Known inference (accepted for now, owner to confirm): MCC's public allotment results list a candidate and seat category for every rank, and Decide shows them (Rank journey, Allotments, `/api/v1/rank-journey`, `/api/v1/allotments`). A resident's exact rank plus college therefore leads to that allotment row and its category; for a `match` = "matched" row it is exactly one. Seatora never joins the two, but it doesn't claim the category is unknowable: the Residents (i), the institute tab's Rank (i) and the privacy notice each say a shown rank can be looked up in MCC's public allotment results, which list each rank's seat and candidate category, PwD included. The alternative is to show no rank (and no quota or round) beside a name.
- Minority quotas (MCC's "Muslim Minority", "Jain Minority": they name a religion) are shown, and filtered, as one "Minority" beside a name.
- "Hide" records the person in `HiddenResident` (name + college PIN code) and sets `hidden`; hidden rows are never rendered or returned, and both imports keep them hidden, even under a new college key or course (hides are copied to a college's new place when an import changes it: a kept college given a PIN, or a retired key's successor).
- The rank is where one person got in, not a closing rank or a prediction.

## Announcements
- Only show announcements traceable to an issuing authority, with a publication date and an official link where one exists.
- With no live feed connected, show an honest empty state or labelled demo content.

## Ingestion
- Validate every imported row with Zod. Reject and report invalid rows instead of silently correcting them.
- Keep the original source document reference for re-verification.
- A fee-table record (`FeesStructured`) whose `fee_display` is "verbatim", or that has none, shows the profile's own words with their link, and no figure except its `fee_parsed` ones: figures `tools/parse_fee_text.py` (planner) read out of those words only where the figure, its unit (a year field, the annual fee, at admission, "per year") and the programme / seat type are explicit, each shown with "see text" and its exact quoted words (US$ figures never as ₹); otherwise none, anywhere (the Fees tab, the stat cells, sorts, caps and CSVs all read the same records); a year the record does not state is "not stated", never another year's figure, and no whole-course fee is computed past it; NBEMS ceilings (`maximum`) and floors (`minimum`) are labelled as such, never as the college's figure. The NBEMS DNB fee carries no GST (withdrawn 17-11-2023) and is paid to the hospital. College `type` is inferred from name and quota, or taken from Seatora's research (`typeBasis` says which), never presented as official.
- Clinical facts (`ClinicalFacts`: beds, OPD/IPD, facilities, course records) are self-reported by the institution: shown as "Self-reported by the hospital, not verified by Seatora", each value with the period its source prints, its source link, the date Seatora checked it and its flags (old, rounded, derived, conflicting); a value not found is "—", never filled in.
- Records older than one counselling cycle without re-verification become OUTDATED.
