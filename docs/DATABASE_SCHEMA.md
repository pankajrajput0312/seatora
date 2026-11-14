# Database Schema (conceptual)

Implemented so far in `prisma/schema.prisma`: **DataSource, College, Specialty, CollegeSpecialty, Cutoff, Allotment, CollegeTerm, Announcement, Resident, WaitlistEntry** (landing-page early access), **User, Session** (email/password auth). The other entities are documented here and added when real source data for them has been examined. Do not model data you have not seen.

## Provenance
Every factual record references a `DataSource` and carries `lastVerifiedAt` and `verificationStatus`. Rules are in [DATA_INTEGRITY.md](DATA_INTEGRITY.md).

## Entities

| Entity | Purpose | Key relationships |
|---|---|---|
| **User** | Account identity (Phase 7) | 1–1 StudentProfile; 1–n SavedCollege, CollegeComparison, CollegeReview |
| **StudentProfile** | Rank, category, domicile state, preferences | belongs to User |
| **College** | Institute: name, slug, city, state, PIN, address (as printed by MCC; null when only a short name was printed), type (Gov/Private/Deemed/Central) | 1–n CollegeSpecialty, FeeStructure, Stipend, BondInformation, CollegeReview |
| **Specialty** | A course: degree (MD/MS/DNB/Diploma/NBEMS Diploma…) + discipline; `code` is the discipline shared across degrees (e.g. `ANAESTHESIOLOGY` for MD, DNB and Diploma), set by the importer | 1–n CollegeSpecialty |
| **CollegeSpecialty** | A specialty offered at a college (join) | 1–n SeatMatrix, Cutoff, Allotment |
| **SeatMatrix** | Seats per counselling year, round, quota and category | belongs to CollegeSpecialty; DataSource |
| **Cutoff** | Opening and closing rank per year, round, quota and category | belongs to CollegeSpecialty; DataSource |
| **Allotment** | One seat allotment as printed in an MCC result: year, round, rank, quota, seat category, status (`allotted` / `fresh` / `upgraded`). Rank and seat only, never a name or roll number | belongs to CollegeSpecialty; DataSource |
| **FeeStructure** | Tuition and other fees per academic year and quota | belongs to College (optionally Specialty); DataSource |
| **Stipend** | Monthly stipend per year of residency | belongs to College; DataSource |
| **BondInformation** | Service bond years, penalty amount, conditions | belongs to College (often state-level); DataSource |
| **CollegeReview** | Resident or alumni experience by category (academics, clinical exposure, faculty, patient load, work-life, hostel) | belongs to College and User; moderation status |
| **CollegeTerm** | Fee, stipend, bond or penalty text exactly as published, per college and program (MD/DNB); `amountInr` only when the text has exactly one rupee figure | belongs to College; DataSource |
| **Resident** | A name on an MCC admitted-candidates list: year, name, list label, 2025 AIR (nullable), `sourceKey` (the list PDF = `DataSource.key`), `hidden` (set from HiddenResident on import). No roll numbers or contact details | belongs to College (cascade) and Specialty |
| **HiddenResident** | A person who asked to be hidden: `name` + `place` (the college's PIN code, or its key without one), so the hide survives both imports, a new college key and a course change | none (no foreign key on purpose) |
| **Announcement** | Counselling notice: authority, category, year, date, official URL | DataSource |
| **DataSource** | Where data came from: name, URL, type (trust tier), publication date | referenced by all factual records |
| **DataVerification** | Audit trail: who verified which record, when, and the outcome | polymorphic (recordType + recordId) |
| **SavedCollege** | A user's shortlisted college with order and notes | User × College |
| **CollegeComparison** | A saved set of colleges (and an optional specialty) to compare | belongs to User; n–n College |

## Notes and open questions
- `Cutoff.quota` and `Cutoff.category` are strings holding the MCC labels verbatim (quota: "All India", "DNB Quota", "Deemed/Paid Seats"…; category: "Open", "OBC", "SC", "ST", "EWS", "<X> PwD"). State counselling labels will differ; do not map them onto MCC ones.

## MCC import (`npm run db:import`)
Source: the neetpg-planner export (`python3 -I tools/export_medpath.py` → `data/medpath/`), built from MCC allotment result PDFs. Aggregates only; the bundle never contains candidate names, roll numbers or application ids, and the Zod schemas (`src/features/cutoffs/lib/import-schema.ts`) are `.strict()` so an extra field aborts the import.
- **closingRank / openingRank**: worst / best NEET PG All India Rank allotted in that round for that college, course, quota and **seat category** (the category of the seat, not of the candidate — an Open seat can go to an OBC candidate).
- **n**: allotments made in that round. In R2, R3 and stray rounds it counts only new or upgraded allotments. It is **not** the seat matrix; never show it as "seats".
- **Provisional rounds**: `DataSource.provisional = true` (e.g. 2026 R1 from the provisional result). Their cutoffs are `verificationStatus = PENDING` and must be labelled provisional in the UI. When the final result for the same year and round is imported, the provisional source's cutoffs are deleted.
- `DataSource.key` (the source PDF path, or the URL for fee/stipend documents) and `College.key` (40 name letters + `#` + PIN) are the stable import keys. College `city` and `type` are null: the source does not give them and they are never guessed. A college slug is set once on creation and not changed on re-import.
- Cutoffs and allotments are replaced source by source in one transaction per source (delete by `sourceId`, then insert). Re-running the import with the same bundle is safe.
- **Allotment** rows are the rank-level data behind the cutoffs: per cell (college, course, year, round, quota, seat category) their count equals `Cutoff.n` and their best/worst rank equal `openingRank`/`closingRank`; the importer checks this before writing. `status` is MCC's remark normalised: `allotted` (R1, stray rounds), `fresh` or `upgraded` (R2, R3). The UI shows `upgraded` as "Upgraded" and the others as "Fresh". Indexes: (year, rank) for rank scans, (collegeSpecialty, year, round) for an institute's course, (source) for replacement.
- Before committing, the importer re-asserts known values and rolls back on any failure; among them, every virtual vacancy row of the newest round must have an allotment in an earlier round of that year on its own college, course, quota and seat category (it is a seat someone holds), which catches one institute split under two keys.
- Rows whose MCC course text could not be split into degree and specialty (e.g. "MD/MS (Anatomy)") are excluded by the exporter and counted in its `manifest.json`.
- Fees can be per course, per year or a lump sum. Model `FeeStructure` after reviewing actual fee notifications.
- Bond terms are often defined by the state rather than the college. Confirm before modelling.
- Reviews need a verification design (for example proof of enrolment) before any review can be labelled verified.

## Residents import (`npm run db:import-residents`)
Source: the PRIVATE neetpg-planner bundle `data/medpath-private/` (`residents.ndjson` + `manifest.json`), read from that path or `RESIDENTS_BUNDLE`, never copied into this repo. Run after `npm run db:import`.
- Each row is validated with a `.strict()` Zod schema (any extra field, e.g. a roll number, aborts); the file's sha256 and row count must match the manifest. `src` must be `mcc/<year>/<list>.pdf`, and `rank` (NBEMS NEET PG 2025 merit list) is only allowed on 2025 rows.
- College by `ikey` = `College.key`, course by degree + `Specialty.code` (as `import-mcc.ts` maps them). Rows with an unknown college or course are rejected and listed, never guessed.
- Replace-all in one transaction. `hidden` is set from `HiddenResident` by (name, college PIN code), never from the rows being replaced (an MCC import that changes a college key or course cascades those away first and reports them as `removed.residents`), so a name someone asked to hide stays hidden. Unhiding is a manual database change: delete the `HiddenResident` row and re-import.
- One `DataSource` per list PDF (key = `sourceKey`, official URL from the planner's `data/official_sources.json`, `round` null so the Decide catalog never counts it as an allotment result).
- Indexes: (collegeId, year) for an institute's tab, (specialtyId).
