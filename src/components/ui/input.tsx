import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 max-md:h-[2.375rem] w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:border-sky aria-invalid:border-ember",
        className,
      )}
      {...props}
    />
  );
}
