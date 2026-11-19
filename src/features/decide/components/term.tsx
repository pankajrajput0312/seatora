"use client";

import { glossary, quotaTerm, roundTerm, type TermKey } from "../lib/glossary";
import { useExamInfo } from "../lib/use-decide-store";
import { InfoTip } from "./info-tip";

/** A jargon word she can tap for its plain meaning (lib/glossary.ts, in the exam's words). `k`: which word; `children`: as shown. */
export function Term({ k, children }: { k: TermKey; children: React.ReactNode }) {
  const exam = useExamInfo().key;
  return (
    <InfoTip label={typeof children === "string" ? children : k} trigger={children}>
      {glossary(exam)[k]}
    </InfoTip>
  );
}

/** A quota as shown, tappable when it is jargon (All India, Deemed/Paid, DNB Quota). */
export function QuotaTerm({ quota, shown }: { quota: string; shown: string }) {
  const k = quotaTerm(quota);
  return k ? <Term k={k}>{shown}</Term> : shown;
}

/** A round's name as shown ("R1", "Stray", "Open Round"), tappable. */
export function RoundTerm({ shown }: { shown: string }) {
  return <Term k={roundTerm(shown)}>{shown}</Term>;
}
