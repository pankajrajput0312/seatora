"use client";

import { AlertCircle } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { siteFonts } from "@/app/site-fonts";
import { useReportError } from "@/features/funnel/components/beacon";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error); // grouped in /decide/admin Errors (docs/FUNNEL.md)
  return (
    <Container className={`${siteFonts} py-32`}>
      <AlertCircle className="size-6 text-ember" strokeWidth={1.75} />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="mt-3 text-muted-foreground">Please try again. If it keeps happening, come back in a few minutes.</p>
      <Button onClick={reset} className="mt-8">Try again</Button>
    </Container>
  );
}
