# Data Integrity

MEDPATH informs decisions that shape doctors' careers. Wrong data is worse than missing data.

## Absolute rules
1. **Never fabricate** college data, cutoffs, seats, fees, stipends, bonds, rankings, reviews, testimonials, user identities or announcements.
2. **Demo data must be labelled** visibly in the UI as "Demo data — illustrative only", and it lives in clearly named files (`*.demo.ts`).
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
| **Verified institutional** | College website or prospectus, confirmed by MEDPATH | "Verified institutional" (teal) |
| **Third-party research** | News, compiled datasets | "Third-party research" (neutral) |
| **Student-reported** | Resident reviews with an identity check | "Student-reported" (neutral), clearly an opinion |
| **Unverified community** | Forum or community submissions | "Unverified" (warning) |

Official information and reported experiences are never mixed in the same block. Profiles show them in separate, labelled sections.

## Reviews
- Do not create a review unless a real person submitted it. Placeholder reviews must say "Illustrative example".
- Only label a review "verified" after an actual verification step has been completed and recorded in DataVerification.
- Show the review date and residency year. Do not show a real name without consent.

## Announcements
- Only show announcements traceable to an issuing authority, with a publication date and an official link where one exists.
- With no live feed connected, show an honest empty state or labelled demo content.

## Ingestion
- Validate every imported row with Zod. Reject and report invalid rows instead of silently correcting them.
- Keep the original source document reference for re-verification.
- Records older than one counselling cycle without re-verification become OUTDATED.
