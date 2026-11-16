import "server-only";
import { cookies, headers } from "next/headers";
import { deviceView, parseView, VIEW_PARAM, viewCookie, type View } from "../components/view-toggle";

/** The device's default view from its headers: cards on a phone (deviceView). */
async function deviceDefault(): Promise<View> {
  const h = await headers();
  return deviceView(h.get("user-agent"), h.get("sec-ch-ua-mobile"));
}

/** A page's Cards | Table view (ViewPanes `view`, ViewToggle `view`): the address's, else her saved one, else the device's. */
export async function chosenView(params: URLSearchParams, page: string): Promise<View> {
  return parseView(params.get(VIEW_PARAM)) ?? parseView((await cookies()).get(viewCookie(page))?.value) ?? deviceDefault();
}

/**
 * Rows a page: `phone` on a phone (half the HTML to download, parse and hydrate there; a shared page link may then
 * start at another row), else `desktop`.
 */
export async function pageSizeFor(desktop: number, phone = 25): Promise<number> {
  return (await deviceDefault()) === "cards" ? phone : desktop;
}
