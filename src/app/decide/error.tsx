"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/features/decide/components/app-page";
import { EmptyState } from "@/features/decide/components/ui";
import { useReportError } from "@/features/funnel/components/beacon";

/** Unexpected failure inside a Decide page (e.g. the database went away): case-sheet state in the app shell, with retry. */
export default function DecideError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error); // grouped in /decide/admin Errors (docs/FUNNEL.md)
  return (
    <AppPage>
      <EmptyState headingLevel={1} icon={CircleAlert} title="This page couldn't load" description="The data could not be read just now, so nothing is shown rather than numbers that might be wrong. Try again; if it keeps happening, come back in a few minutes." className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </AppPage>
  );
}
