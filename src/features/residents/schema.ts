import { z } from "zod";

export const residentCategories = ["Open", "EWS", "OBC", "SC", "ST", "Open PwD", "EWS PwD", "OBC PwD", "SC PwD", "ST PwD"] as const;
export const residentQuotas = ["AIQ", "State", "Deemed", "Central institute", "Management", "NRI"] as const;
export const residentRounds = ["R1", "R2", "R3", "Stray", "Special stray", "State round"] as const;

/** One resident, added by hand to data/residents.json. See README "Adding residents". */
export const residentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** NEET PG All India Rank. */
    rank: z.number().int().positive(),
    category: z.enum(residentCategories),
    quota: z.enum(residentQuotas),
    /** Counselling year they were allotted in. */
    year: z.number().int().min(2015).max(2100),
    round: z.enum(residentRounds).optional(),
    college: z.string().trim().min(1),
    state: z.string().trim().min(1).optional(),
    /** e.g. "MD General Medicine". */
    course: z.string().trim().min(1),
    /** Set true only after checking their allotment letter. */
    verified: z.boolean().default(false),
    /** Names are shown publicly, so every entry needs the resident's agreement. */
    consent: z.literal(true, "Only add residents who agreed to be listed by name (consent: true)"),
  })
  .strict();

export type Resident = z.infer<typeof residentSchema>;
export type ResidentCategory = (typeof residentCategories)[number];
