"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlist } from "../actions";
import Link from "next/link";
import { waitlistSchema, type WaitlistInput } from "../validations";

export function WaitlistForm({ examYears }: { examYears: number[] }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "done" | string>("idle");
  const { register, handleSubmit, formState: { errors } } = useForm<WaitlistInput>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: { email: "", examYear: examYears[0] },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const res = await joinWaitlist(values);
      setStatus(res.ok ? "done" : res.error);
    }),
  );

  if (status === "done") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-leaf/30 bg-leaf/10 p-4 text-sm text-leaf">
        <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.75} />
        You&apos;re on the list. We&apos;ll email you when the planner opens.
      </p>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="relative grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start">
      <div>
        <label htmlFor="wl-email" className="sr-only">Email</label>
        <Input
          id="wl-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="h-12"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "wl-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && <p id="wl-email-error" className="mt-1.5 text-xs text-ember">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="wl-year" className="sr-only">NEET PG year</label>
        <select
          id="wl-year"
          className="h-12 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:border-sky"
          {...register("examYear")}
        >
          {examYears.map((y) => <option key={y} value={y}>NEET PG {y}</option>)}
        </select>
      </div>
      <div aria-hidden className="absolute -left-[9999px]">
        <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Get early access
      </Button>
      {status !== "idle" && <p role="alert" className="text-sm text-ember sm:col-span-3">{status}</p>}
      <p className="text-xs text-muted-foreground sm:col-span-3">
        We&apos;ll only use your email to tell you when Seatora opens. See our{" "}
        <Link href="/privacy" className="underline hover:text-foreground">privacy notice</Link>.
      </p>
    </form>
  );
}
