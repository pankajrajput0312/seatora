"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/features/decide/components/app-page";
import { EmptyState } from "@/features/decide/components/ui";

/** Unknown institute (or other notFound()) inside Decide: stays in the app shell, with a way back. The shell re-adds the saved profile to the URL. */
export default function DecideNotFound() {
  // Staff on another exam: its ?exam= stays (none on NEET PG).
  const exam = useSearchParams().get("exam");
  const q = exam ? `?${new URLSearchParams({ exam })}` : "";
  return (
    <AppPage>
      <EmptyState headingLevel={1} icon={FileQuestion} title="Not found" description="This institute or page isn't in the MCC data. A saved link may be out of date." className="mt-6">
        <Button asChild variant="secondary"><Link href={`/decide/institutes${q}`}>All institutes</Link></Button>
        <Button asChild variant="ghost"><Link href={`/decide${q}`}>Home</Link></Button>
      </EmptyState>
    </AppPage>
  );
}
