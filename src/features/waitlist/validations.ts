import { z } from "zod";

const thisYear = new Date().getFullYear();
export const examYears = [thisYear, thisYear + 1, thisYear + 2] as const;

export const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  examYear: z.coerce
    .number()
    .int()
    // Page is prerendered, so the client's year list can lag the server's by a year.
    .refine((y) => y >= thisYear - 1 && y <= thisYear + 3, "Choose your NEET PG year"),
  /** Honeypot: hidden from people, so any value means a bot. */
  website: z.string().optional(),
});
export type WaitlistInput = z.input<typeof waitlistSchema>;
