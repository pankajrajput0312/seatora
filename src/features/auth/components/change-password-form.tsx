"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword } from "../actions";
import { changePasswordSchema, type ChangePasswordInput } from "../validations";

/** `email` fills a hidden username field, so password managers update the right entry. */
export function ChangePasswordForm({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", password: "", confirm: "" },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setResult(null);
      const res = await changePassword(values);
      if (res.ok) {
        reset();
        setResult({ ok: true, message: "Password changed. Every other device has been signed out; this one stays signed in." });
      } else {
        setResult({ ok: false, message: res.error });
        setFocus("current");
      }
    }),
  );

  const field = (name: keyof ChangePasswordInput, label: string, autoComplete: string) => (
    <div>
      <label htmlFor={`pw-${name}`} className="text-sm font-medium">{label}</label>
      <Input
        id={`pw-${name}`}
        type="password"
        autoComplete={autoComplete}
        className="mt-1.5 h-11"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `pw-${name}-error` : name === "password" ? "pw-password-hint" : undefined}
        {...register(name)}
      />
      {errors[name] ? (
        <p id={`pw-${name}-error`} className="mt-1.5 text-xs text-ember">{errors[name]?.message}</p>
      ) : (
        name === "password" && <p id="pw-password-hint" className="mt-1.5 text-xs text-muted-foreground">8 to 128 characters.</p>
      )}
    </div>
  );

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {field("current", "Current password", "current-password")}
      {field("password", "New password", "new-password")}
      {field("confirm", "Confirm new password", "new-password")}
      <div aria-live="polite">
        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "rounded-md border border-leaf/30 bg-leaf/10 px-3 py-2 text-sm text-leaf" : "rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember"}
          >
            {result.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Change password
      </Button>
    </form>
  );
}
