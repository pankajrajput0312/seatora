import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky/10 text-sky",
  success: "bg-leaf/10 text-leaf",
  warning: "bg-sun/10 text-sun",
  error: "bg-ember/10 text-ember",
} as const;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
