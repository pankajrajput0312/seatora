import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-input bg-secondary text-foreground hover:bg-raised",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "text-ember hover:bg-ember/10",
} as const;

// md and icon meet the 44px touch target; sm is for dense desktop-only rows.
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-sm", lg: "h-12 px-6 text-base", icon: "size-11" } as const;

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", asChild, className, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
