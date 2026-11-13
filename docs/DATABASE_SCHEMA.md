# Database Schema (conceptual)

Implemented so far in `prisma/schema.prisma`: **DataSource, College, Specialty, CollegeSpecialty, Cutoff, Announcement, WaitlistEntry** (landing-page early access). The other entities are documented here and added when real source data for them has been examined. Do not model data you have not seen.

## Provenance
Every factual record references a `DataSource` and carries `lastVerifiedAt` and `verificationStatus`. Rules are in [DATA_INTEGRITY.md](DATA_INTEGRITY.md).

## Entities

| Entity | Purpose | Key relationships |
|---|---|---|
| **User** | Account identity (Phase 7) | 1–1 StudentProfile; 1–n SavedCollege, CollegeComparison, CollegeReview |
| **StudentProfile** | Rank, category, domicile state, preferences | belongs to User |
| **College** | Institute: name, slug, city, state, type (Gov/Private/Deemed/Central) | 1–n CollegeSpecialty, FeeStructure, Stipend, BondInformation, CollegeReview |
| **Specialty** | MD/MS/DNB/Diploma discipline | 1–n CollegeSpecialty |
| **CollegeSpecialty** | A specialty offered at a college (join) | 1–n SeatMatrix, Cutoff |
| **SeatMatrix** | Seats per counselling year, round, quota and category | belongs to CollegeSpecialty; DataSource |
| **Cutoff** | Opening and closing rank per year, round, quota and category | belongs to CollegeSpecialty; DataSource |
| **FeeStructure** | Tuition and other fees per academic year and quota | belongs to College (optionally Specialty); DataSource |
| **Stipend** | Monthly stipend per year of residency | belongs to College; DataSource |
| **BondInformation** | Service bond years, penalty amount, conditions | belongs to College (often state-level); DataSource |
| **CollegeReview** | Resident or alumni experience by category (academics, clinical exposure, faculty, patient load, work-life, hostel) | belongs to College and User; moderation status |
| **Announcement** | Counselling notice: authority, category, year, date, official URL | DataSource |
| **DataSource** | Where data came from: name, URL, type (trust tier), publication date | referenced by all factual records |
| **DataVerification** | Audit trail: who verified which record, when, and the outcome | polymorphic (recordType + recordId) |
| **SavedCollege** | A user's shortlisted college with order and notes | User × College |
| **CollegeComparison** | A saved set of colleges (and an optional specialty) to compare | belongs to User; n–n College |

## Notes and open questions
- Categories and quotas vary by state, so `Cutoff.category` stays a string until the full set is known, while `Quota` is an enum.
- Fees can be per course, per year or a lump sum. Model `FeeStructure` after reviewing actual fee notifications.
- Bond terms are often defined by the state rather than the college. Confirm before modelling.
- Reviews need a verification design (for example proof of enrolment) before any review can be labelled verified.
