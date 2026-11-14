import { cn } from "@/lib/cn";

/**
 * Inside-app page frame: uses the full width beside the sidebar (capped for very wide screens), no centred column.
 * min-w-0 lets wide tables scroll inside their own region; for a grid layout pass `grid grid-cols-1 gap-6` (a bare
 * `grid` has an auto track that grows to fit the widest child).
 */
export function AppPage({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("w-full min-w-0 max-w-[110rem] px-4 py-6 md:px-6 xl:px-10", className)} {...props} />;
}
