import { Button } from "@/components/ui/button";

/** MCC's official PG counselling site: schedules, notices, seat matrices and results. */
export const MCC_PG = "https://mcc.nic.in/pg-medical-counselling/";

/** Button-styled link to the official MCC PG counselling site, for empty states that point there. */
export function MccLink({ children = "Official MCC PG counselling site" }: { children?: React.ReactNode }) {
  return (
    <Button asChild variant="secondary">
      <a href={MCC_PG} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>
    </Button>
  );
}
