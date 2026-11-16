"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "../actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../validations";

/** /reset's form: a new password twice. On success the action signs her in and opens the planner. */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      const res = await resetPassword(token, values); // redirects on success
      if (res) setError(res.error);
    }),
  );
  const field = (name: keyof ResetPasswordInput, label: string) => (
    <div>
      <label htmlFor={`reset-${name}`} className="text-sm font-medium">{label}</label>
      <Input
        id={`reset-${name}`}
        type="password"
        autoComplete="new-password"
        className="mt-1.5 h-11"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `reset-${name}-error` : name === "password" ? "reset-hint" : undefined}
        {...register(name)}
      />
      {errors[name] ? (
        <p id={`reset-${name}-error`} className="mt-1.5 text-xs text-ember">{errors[name]?.message}</p>
      ) : (
        name === "password" && <p id="reset-hint" className="mt-1.5 text-xs text-muted-foreground">At least 8 characters.</p>
      )}
    </div>
  );
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <p className="text-sm text-muted-foreground">For <span className="text-foreground">{email}</span>. Every device signed in to this account is signed out.</p>
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {field("password", "New password")}
      {field("confirm", "Confirm new password")}
      {error && <p role="alert" className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Set password and sign in
      </Button>
    </form>
  );
}
