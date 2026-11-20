"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFormAction } from "../actions";
import { openSignUpSchema, signInSchema, signUpSchema, type SignUpInput } from "../validations";

type Mode = "signin" | "signup";

/**
 * `next`: the page's ?next=, passed through (the actions sanitise it) and kept on the sign-in / sign-up link. `open`:
 * SEATORA_OPEN_ACCESS=1, so sign-up has no invite code field. `refCode`: the page's ?ref= (a referral), passed to sign-up.
 * A real form posting to a Server Action (authFormAction): before the script loads (slow 3G) it is a plain POST and the
 * page comes back with the error and her name and email; after, the fields are checked here first and never cleared.
 */
export function AuthForm({ mode, next, open = false, refCode }: { mode: Mode; next?: string; open?: boolean; refCode?: string }) {
  const isSignUp = mode === "signup";
  const [state, action, pending] = useActionState(authFormAction, null);
  const [errors, setErrors] = useState<Partial<Record<keyof SignUpInput, string>>>({});
  const schema = isSignUp ? (open ? openSignUpSchema : signUpSchema) : signInSchema;

  // Not the form's own submit: React would reset the fields after the action, and a wrong password would cost her the email too.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const r = schema.safeParse(Object.fromEntries(form));
    if (!r.success) {
      const found: typeof errors = {};
      for (const i of r.error.issues) found[i.path[0] as keyof SignUpInput] ??= i.message;
      setErrors(found);
      e.currentTarget.querySelector<HTMLInputElement>(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setErrors({});
    startTransition(() => action(form));
  };

  const field = (name: keyof SignUpInput, label: string, props: React.ComponentProps<"input">) => (
    <div>
      <label htmlFor={`auth-${name}`} className="text-sm font-medium">{label}</label>
      <Input
        id={`auth-${name}`}
        name={name}
        className="mt-1.5 h-11"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `auth-${name}-error` : undefined}
        {...props}
      />
      {errors[name] && <p id={`auth-${name}-error`} className="mt-1.5 text-xs text-ember">{errors[name]}</p>}
    </div>
  );

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="grid gap-4">
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}
      {refCode && <input type="hidden" name="ref" value={refCode} />}
      {isSignUp && field("name", "Name", { autoComplete: "name", defaultValue: state?.values.name })}
      {field("email", "Email", { type: "email", autoComplete: "email", defaultValue: state?.values.email })}
      {field("password", "Password", {
        type: "password",
        autoComplete: isSignUp ? "new-password" : "current-password",
        placeholder: isSignUp ? "At least 8 characters" : undefined,
      })}
      {!isSignUp && <Link href="/forgot" className="-mt-2 inline-flex min-h-11 items-center justify-self-end text-sm text-sky underline">Forgot password?</Link>}
      {isSignUp && !open && field("invite", "Invite code", { autoComplete: "off", spellCheck: false })}
      {state?.error && <p role="alert" className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{state.error}</p>}
      <Button type="submit" size="lg" aria-disabled={pending || undefined} className="mt-2 aria-disabled:opacity-50">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {isSignUp ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : open ? "New here? " : "Invited, and new here? "}
        <Link
          href={{ pathname: isSignUp ? "/login" : "/signup", query: next ? { next } : undefined }}
          className="font-medium text-sky underline"
        >
          {isSignUp ? "Sign in" : "Create your account"}
        </Link>
      </p>
    </form>
  );
}
