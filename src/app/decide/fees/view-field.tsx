"use client";

import { useSearchParams } from "next/navigation";
import { VIEW_PARAM } from "@/features/decide/components/view-toggle";

/**
 * The Cards | Table choice in the filter form, so Apply keeps it without JS. Read from the address as it is now (the
 * toggle updates it in place), never a server copy that would undo a switch made after load.
 */
export function ViewField() {
  const v = useSearchParams()?.get(VIEW_PARAM);
  return v === "cards" || v === "table" ? <input type="hidden" name={VIEW_PARAM} value={v} /> : null;
}
