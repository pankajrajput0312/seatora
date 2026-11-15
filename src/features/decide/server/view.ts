import "server-only";
import { cookies, headers } from "next/headers";
import { deviceView, parseView, VIEW_PARAM, viewCookie, type View } from "../components/view-toggle";

/** A page's Cards | Table view (ViewPanes `view`, ViewToggle `view`): the address's, else her saved one, else the device's. */
export async function chosenView(params: URLSearchParams, page: string): Promise<View> {
  const chosen = parseView(params.get(VIEW_PARAM)) ?? parseView((await cookies()).get(viewCookie(page))?.value);
  if (chosen) return chosen;
  const h = await headers();
  return deviceView(h.get("user-agent"), h.get("sec-ch-ua-mobile"));
}
