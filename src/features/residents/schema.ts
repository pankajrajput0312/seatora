import { z } from "zod";

export const residentCategories = ["Open", "EWS", "OBC", "SC", "ST", "Open PwD", "EWS PwD", "OBC PwD", "SC PwD", "ST PwD"] as const;
export const residentQuotas = ["AIQ", "State", "Deemed", "Central institute", "Management", "NRI"] as const;
export const residentRounds = ["R1", "R2", "R3", "Stray", "Special stray", "State round"] as const;

const phone = z.string().regex(/^\+?\d{10,15}$/, "Digits only, with country code, e.g. +919812345678");

/** Ways to reach a resident. All optional; only add what they agreed to share. */
export const contactSchema = z
  .object({
    whatsapp: phone.optional(),
    phone: phone.optional(),
    email: z.email().optional(),
    instagram: z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Instagram handle without @").optional(),
    linkedin: z.url().refine((u) => new URL(u).hostname.endsWith("linkedin.com"), "Must be a linkedin.com URL").optional(),
  })
  .strict();
export type Contact = z.infer<typeof contactSchema>;

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
    contact: contactSchema.default({}),
    /** Set true only after checking their allotment letter. */
    verified: z.boolean().default(false),
    /** Name and contact details are public, so every entry needs the resident's agreement to both. */
    consent: z.literal(true, "Only add residents who agreed to be listed with their name and contact details (consent: true)"),
  })
  .strict();

export type Resident = z.infer<typeof residentSchema>;
export type ResidentCategory = (typeof residentCategories)[number];
