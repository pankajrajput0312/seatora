import { business } from "@/config/business";
import { formatINR } from "@/features/cutoffs/lib/format";

/** "₹0 ~~₹499~~ Free till 19 Nov", read out as "Was ₹499, now free till 19 November". */
export function FreePrice({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">Was {formatINR(business.regularPrice)}, now free till 19 November</span>
      <span aria-hidden>
        <span className="numeric">{formatINR(business.price)}</span>{" "}
        <s className="numeric font-normal text-muted-foreground">{formatINR(business.regularPrice)}</s> Free till 19 Nov
      </span>
    </span>
  );
}
