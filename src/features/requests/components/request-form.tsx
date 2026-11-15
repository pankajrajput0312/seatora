"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { submitFeatureRequest } from "../actions";
import { featureRequestSchema, REQUEST_KINDS, requestKindLabel, type FeatureRequestInput } from "../validations";
import { navigating } from "@/features/decide/components/nav-pending";

const MAX = 2000;
// Signed out there is no account to reply to, so the email is required.
const publicSchema = featureRequestSchema.extend({
  email: z.string().trim().toLowerCase().min(1, "Enter your email so we can reply.").max(200).email("Enter a valid email so we can reply."),
});
const pill = "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-secondary px-3 text-sm has-checked:border-sky";
const hint = "mt-1.5 text-xs text-muted-foreground";
const noop = () => () => {};

/**
 * "Request a feature": a feature, a customization, a data correction or anything else. `email`: the signed-in account's,
 * shown read-only (replies go there); without it the visitor types one. `page`: where it was sent from.
 */
export function RequestForm({ email, page }: { email?: string; page: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  // False in the server HTML and until hydration: a send before then would post the page to itself and lose the message.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  // defaultValue below puts the email and page in the server HTML too. No defaultChecked on the radios: RHF would read
  // the DOM instead of setting it on reset(values), and leave no kind ticked after a send.
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FeatureRequestInput>({
    resolver: zodResolver(email ? featureRequestSchema : publicSchema),
    defaultValues: { kind: "feature", message: "", email: email ?? "", page, website: "" },
  });
  const length = watch("message")?.length ?? 0;

  const onSubmit = handleSubmit((values) => {
    if (pending) return; // aria-disabled, not disabled, so the button keeps focus while sending
    setResult(null); // clears the last reply while sending
    startTransition(async () => {
      const res = await submitFeatureRequest(email ? { ...values, email } : values).catch(() => ({
        ok: false as const,
        error: "We couldn't send your request. Check your connection and try again.",
      }));
      if (res.ok) {
        reset({ kind: "feature", message: "", email: values.email, page, website: "" }); // her email stays for the next one
        setResult({ ok: true, message: "Thanks — we reply within 2 working days.", at: Date.now() });
        if (email) {
          navigating(true); // inside Decide: the shell keeps the refresh moving (decide-shell.tsx)
          router.refresh(); // "Your requests" on the page
        }
      } else {
        setResult({ ok: false, message: res.error, at: Date.now() }); // her message stays in the form
      }
    });
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="relative grid gap-5">
      <fieldset>
        <legend className="text-sm font-medium">What is it about?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {REQUEST_KINDS.map((k) => (
            <label key={k} className={pill}>
              <input type="radio" value={k} className="size-4 shrink-0 accent-sky" {...register("kind")} />
              {requestKindLabel[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rq-message" className="text-sm font-medium">Your message</label>
        <textarea
          id="rq-message"
          rows={6}
          className="mt-1.5 block min-h-36 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky aria-invalid:border-ember"
          aria-required
          aria-invalid={!!errors.message}
          aria-describedby={`rq-message-hint rq-message-count${errors.message ? " rq-message-error" : ""}`}
          {...register("message")}
        />
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
          <p id="rq-message-hint" className="text-muted-foreground">What you need, and the page or college it&apos;s about. At least 10 characters.</p>
          <p id="rq-message-count" className={cn("numeric", length > MAX ? "text-ember" : "text-muted-foreground")}>
            {length.toLocaleString("en-IN")} / {MAX.toLocaleString("en-IN")} characters
          </p>
        </div>
        {errors.message && <p id="rq-message-error" className="mt-1.5 text-xs text-ember">{errors.message.message}</p>}
      </div>

      <div>
        <label htmlFor="rq-email" className="text-sm font-medium">Email</label>
        <Input
          id="rq-email"
          type="email"
          autoComplete="email"
          readOnly={!!email}
          defaultValue={email}
          placeholder={email ? undefined : "you@example.com"}
          className={cn("mt-1.5 h-11", email && "text-muted-foreground")}
          aria-required={!email || undefined}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "rq-email-error rq-email-note" : "rq-email-note"}
          {...register("email")}
        />
        {errors.email && <p id="rq-email-error" className="mt-1.5 text-xs text-ember">{errors.email.message}</p>}
        <p id="rq-email-note" className={hint}>
          {email ? "Your account email. We reply here." : <>We use it only to reply to this request. See our <Link href="/privacy" className="underline hover:text-foreground">privacy notice</Link>.</>}
        </p>
      </div>

      <input type="hidden" defaultValue={page} {...register("page")} />
      <div aria-hidden className="absolute -left-[9999px]">
        <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div role="status" aria-live="polite">
        {/* A new node (key) per reply, so the same reply twice is announced again. */}
        {result && (
          <p
            key={result.at}
            className={result.ok ? "rounded-md border border-leaf/30 bg-leaf/10 px-3 py-2 text-sm text-leaf" : "rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember"}
          >
            {result.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={!ready} aria-disabled={pending || undefined} className="justify-self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
