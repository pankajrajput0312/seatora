import "server-only";
import { cookies } from "next/headers";
import { parseView, VIEW_PARAM, viewCookie, type View } from "../components/view-toggle";

/**
 * A page's Cards | Table choice for ViewPanes `view`: the address's, else the one saved on the device (the toggle's
 * cookie); null = not chosen (both panes, the breakpoint picks).
 */
export async function chosenView(params: URLSearchParams, page: string): Promise<View | null> {
  return parseView(params.get(VIEW_PARAM)) ?? parseView((await cookies()).get(viewCookie(page))?.value);
}
