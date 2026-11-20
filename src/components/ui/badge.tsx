import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky/10 text-sky",
  success: "bg-leaf/10 text-leaf",
  warning: "bg-sun/10 text-sun",
  error: "bg-ember/10 text-ember",
  // Reach (lib/reach.ts reachTone): reached, reached only in a later (stray) round, within 10%, closed before her rank,
  // and no allotment to compare with (a dashed outline: nothing is there).
  reached: "bg-reach-reached/10 text-reach-reached",
  later: "bg-reach-later/10 text-reach-later",
  within: "bg-reach-within/10 text-reach-within",
  closed: "bg-muted text-reach-closed",
  none: "border border-dashed border-input text-reach-none",
  // An MCC result's state.
  provisional: "bg-provisional/10 text-provisional",
  final: "bg-final/10 text-final",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
