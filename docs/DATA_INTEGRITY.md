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

## Admitted-list residents (Decide institute "Residents" tab)
- Names come only from MCC's official admitted-candidates lists (`Resident`, imported from a private bundle that never enters git), with the list PDF as source. Name, course, year, list and the 2025 AIR where known: no roll numbers, and no contact details are held or shown.
- Shown per institute only, for choosing a college, with the caption "contact people respectfully; ask to be hidden and we will". There is no endpoint across institutes, responses are `Cache-Control: private, no-store`, and the tab is `noindex`.
- "Hide" records the person in `HiddenResident` (name + college PIN code) and sets `hidden`; hidden rows are never rendered or returned, and both imports keep them hidden, even under a new college key or course (hides are copied to a college's new place when an import changes it: a kept college given a PIN, or a retired key's successor).
- The rank is where one person got in, not a closing rank or a prediction.

## Announcements
- Only show announcements traceable to an issuing authority, with a publication date and an official link where one exists.
- With no live feed connected, show an honest empty state or labelled demo content.

## Ingestion
- Validate every imported row with Zod. Reject and report invalid rows instead of silently correcting them.
- Keep the original source document reference for re-verification.
- A fee-table record (`FeesStructured`) whose `fee_display` is "verbatim", or that has none, shows only the profile's own words with their link, never a figure, anywhere (the Fees tab, one-line summaries, sorts, caps and CSVs all read the same records); a year the record does not state is "not stated", never another year's figure, and no whole-course fee is computed past it; NBEMS ceilings (`maximum`) and floors (`minimum`) are labelled as such, never as the college's figure. The NBEMS DNB fee carries no GST (withdrawn 17-11-2023) and is paid to the hospital. College `type` is inferred from name and quota (`typeBasis`), never presented as official.
- Clinical facts (`ClinicalFacts`: beds, OPD/IPD, facilities, course records) are self-reported by the institution: shown as "Self-reported by the hospital, not verified by Seatora", each value with the period its source prints, its source link, the date Seatora checked it and its flags (old, rounded, derived, conflicting); a value not found is "—", never filled in.
- Records older than one counselling cycle without re-verification become OUTDATED.
