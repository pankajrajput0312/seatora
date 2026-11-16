import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const newPassword = z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email,
  password: newPassword,
  invite: z.string().trim().min(1, "Enter your invite code").max(128),
});

/** Sign-up with SEATORA_OPEN_ACCESS=1: no invite code. */
export const openSignUpSchema = signUpSchema.omit({ invite: true });

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password").max(128),
    password: newPassword,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "The new passwords don't match", path: ["confirm"] });

/** A new password from a reset link: sign-up's rules, typed twice. */
export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "The passwords don't match", path: ["confirm"] });

export type SignInInput = z.input<typeof signInSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
/** `invite` only without open access. */
export type SignUpInput = z.input<typeof openSignUpSchema> & { invite?: string };
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
