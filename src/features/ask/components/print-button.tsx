"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Download PDF": the browser's print dialog (Save as PDF); print CSS hides the app chrome. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()} data-print-hide>
      <Printer className="size-4" aria-hidden /> Download PDF
    </Button>
  );
}
