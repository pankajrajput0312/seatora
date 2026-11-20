import * as Slot from "radix-ui/slot"; // subpath: the "radix-ui" barrel in a server component ships every primitive to the client
import { cn } from "@/lib/cn";

// primary: the accent, one per view where it can be; secondary: a white control with a quiet edge (its words name it);
// ghost: no box until hovered; danger: destructive.
const variants = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  secondary: "border border-edge bg-secondary text-foreground shadow-xs hover:border-input hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "text-ember hover:bg-ember/10",
} as const;

// md, lg and icon are 44px touch targets at every width; sm (36px) is for dense rows, where a `hit` box or the row
// itself gives the 44px.
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-sm max-md:px-3", lg: "h-12 px-6 text-base", icon: "size-11" } as const;

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
