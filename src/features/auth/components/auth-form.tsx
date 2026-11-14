"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "../actions";
import { signInSchema, signUpSchema, type SignUpInput } from "../validations";

type Mode = "signin" | "signup";

/** `next`: the page's ?next=, passed through (the actions sanitise it) and kept on the sign-in / sign-up link. */
export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const isSignUp = mode === "signup";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<SignUpInput>({
    // Sign-in ignores `name`; one form type keeps the field helper simple.
    resolver: (isSignUp ? zodResolver(signUpSchema) : zodResolver(signInSchema)) as unknown as Resolver<SignUpInput>,
    defaultValues: { name: "", email: "", password: "", invite: "" },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      // On success the action redirects, so a returned value is always an error.
      const res = isSignUp ? await signUp(values, next) : await signIn(values, next);
      if (res) setError(res.error);
    }),
  );

  const field = (name: keyof SignUpInput, label: string, props: React.ComponentProps<"input">) => (
    <div>
      <label htmlFor={`auth-${name}`} className="text-sm font-medium">{label}</label>
      <Input
        id={`auth-${name}`}
        className="mt-1.5 h-11"
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `auth-${name}-error` : undefined}
        {...props}
        {...register(name)}
      />
      {errors[name] && <p id={`auth-${name}-error`} className="mt-1.5 text-xs text-ember">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      {isSignUp && field("name", "Name", { autoComplete: "name" })}
      {field("email", "Email", { type: "email", autoComplete: "email" })}
      {field("password", "Password", {
        type: "password",
        autoComplete: isSignUp ? "new-password" : "current-password",
        placeholder: isSignUp ? "At least 8 characters" : undefined,
      })}
      {isSignUp && field("invite", "Invite code", { autoComplete: "off", spellCheck: false })}
      {error && <p role="alert" className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {isSignUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "Invited, and new here? "}
        <Link
          href={{ pathname: isSignUp ? "/login" : "/signup", query: next ? { next } : undefined }}
          className="text-foreground underline hover:text-sky"
        >
          {isSignUp ? "Sign in" : "Create your account"}
        </Link>
      </p>
    </form>
  );
}
