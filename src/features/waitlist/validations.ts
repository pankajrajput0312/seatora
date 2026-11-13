import { z } from "zod";

/** Selectable NEET PG years. Computed on the server and passed to the form as a prop. */
export function examYearsFrom(now = new Date()) {
  const y = now.getFullYear();
  return [y, y + 1, y + 2];
}

export const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
  examYear: z.coerce
    .number()
    .int()
    // Page is prerendered, so the rendered year list can lag the server clock by a year.
    .refine((y) => {
      const now = new Date().getFullYear();
      return y >= now - 1 && y <= now + 3;
    }, "Choose your NEET PG year"),
  /** Honeypot: hidden from people, so any value means a bot. */
  website: z.string().optional(),
});
export type WaitlistInput = z.input<typeof waitlistSchema>;
