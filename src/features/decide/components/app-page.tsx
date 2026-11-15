import { cn } from "@/lib/cn";
import { PageSources, PageSourcesFooter } from "./page-sources";

/**
 * Inside-app page frame: uses the full width beside the sidebar (capped for very wide screens), no centred column.
 * min-w-0 lets wide tables scroll inside their own region; for a grid layout pass `grid grid-cols-1 gap-6` (a bare
 * `grid` has an auto track that grows to fit the widest child). Every page's sources (DataSource, SourceRef,
 * SourceRefs, RegisterSources in it) are listed once, numbered, in the collapsed "Sources (N)" footer it ends with.
 */
export function AppPage({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <PageSources>
      <div className={cn("w-full min-w-0 max-w-[110rem] px-4 py-6 md:px-6 xl:px-10", className)} {...props}>
        {children}
        {/* In a grid page the gap spaces it; otherwise its own margin. */}
        <PageSourcesFooter className="mt-6 [.grid>&]:mt-0" />
      </div>
    </PageSources>
  );
}
