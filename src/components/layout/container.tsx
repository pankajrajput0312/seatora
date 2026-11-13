import { cn } from "@/lib/cn";

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-content px-5 md:px-8", className)} {...props} />;
}
