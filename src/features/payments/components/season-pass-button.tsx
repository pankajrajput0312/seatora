import { getCurrentUser } from "@/features/auth/lib/session";
import { paymentsOn } from "../plans";
import { hasPaid } from "../service";
import { BuySeasonPass } from "./buy-season-pass";

/** BuySeasonPass with its state from the server (signed in? paid?), for dynamic pages such as the planner's home. */
export async function SeasonPassButton(props: { next: string; className?: string; noteClassName?: string }) {
  if (!paymentsOn()) return null;
  const user = await getCurrentUser();
  const status = !user ? "signed_out" : (await hasPaid(user.id)) ? "paid" : "can_buy";
  return <BuySeasonPass status={status} {...props} />;
}
