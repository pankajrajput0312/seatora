import { business } from "@/config/business";
import { formatINR } from "@/features/cutoffs/lib/format";

/** "₹0 ~~₹499~~ Free", read out as "Was ₹499, now free". */
export function FreePrice({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">Was {formatINR(business.regularPrice)}, now free</span>
      <span aria-hidden>
        <span className="numeric">{formatINR(business.price)}</span>{" "}
        <s className="numeric font-normal text-muted-foreground">{formatINR(business.regularPrice)}</s> Free
      </span>
    </span>
  );
}
