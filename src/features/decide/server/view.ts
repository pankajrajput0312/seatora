import "server-only";
import { cookies, headers } from "next/headers";
import { deviceView, parseView, parseWidth, VIEW_PARAM, viewCookie, WIDTH_COOKIE, type View } from "../components/view-toggle";

/**
 * A phone-width window: the width the shell last measured on this browser (WIDTH_COOKIE), else the device's guess from
 * its headers (deviceView: a phone's user agent). The layout (no side menu column) and the views follow it.
 */
export async function isPhone(): Promise<boolean> {
  const measured = parseWidth((await cookies()).get(WIDTH_COOKIE)?.value);
  if (measured) return measured === "phone";
  const h = await headers();
  return deviceView(h.get("user-agent"), h.get("sec-ch-ua-mobile")) === "cards";
}

/** A page's Cards | Table view (ViewPanes `view`, ViewToggle `view`): the address's, else her pick at this width, else cards on a phone. */
export async function chosenView(params: URLSearchParams, page: string): Promise<View> {
  const asked = parseView(params.get(VIEW_PARAM));
  if (asked) return asked;
  const phone = await isPhone();
  return parseView((await cookies()).get(viewCookie(page, phone))?.value) ?? (phone ? "cards" : "table");
}

/**
 * Rows a page: `phone` on a phone (half the HTML to download, parse and hydrate there; a shared page link may then
 * start at another row), else `desktop`.
 */
export async function pageSizeFor(desktop: number, phone = 25): Promise<number> {
  return (await isPhone()) ? phone : desktop;
}
