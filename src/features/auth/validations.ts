import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
});

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
