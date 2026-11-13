import { z } from "zod";

/** Trust tiers, highest first. See docs/DATA_INTEGRITY.md. */
export const sourceTypes = [
  "OFFICIAL",
  "VERIFIED_INSTITUTIONAL",
  "THIRD_PARTY_RESEARCH",
  "STUDENT_REPORTED",
  "UNVERIFIED_COMMUNITY",
] as const;
export type SourceType = (typeof sourceTypes)[number];

export const verificationStatuses = ["VERIFIED", "PENDING", "DISPUTED", "OUTDATED"] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

/** Provenance every important record must carry. */
export const provenanceSchema = z.object({
  sourceName: z.string().min(1),
  sourceUrl: z.url().nullable(),
  sourceType: z.enum(sourceTypes),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-YY, e.g. 2025-26"),
  counsellingYear: z.number().int().min(2000),
  lastVerifiedAt: z.coerce.date().nullable(),
  verificationStatus: z.enum(verificationStatuses),
});
export type Provenance = z.infer<typeof provenanceSchema>;
