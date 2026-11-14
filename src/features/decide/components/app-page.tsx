import { cn } from "@/lib/cn";

/** Inside-app page frame: uses the full width beside the sidebar (capped for very wide screens), no centred column. */
export function AppPage({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("w-full max-w-[110rem] px-4 py-6 md:px-6 xl:px-10", className)} {...props} />;
}
