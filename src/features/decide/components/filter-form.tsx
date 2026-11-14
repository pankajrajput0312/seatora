"use client";

import type { ComponentProps } from "react";
import Form from "next/form";

/**
 * next/form for the GET filter forms whose fields remount after a submit (FilterBar, Options, Seats): submitting moves
 * focus to the form's Apply button, which stays mounted, so Enter in a field never leaves focus on the page body.
 */
export function FilterForm(props: ComponentProps<typeof Form>) {
  return <Form {...props} onSubmit={(e) => e.currentTarget.querySelector<HTMLElement>("[type=submit]")?.focus()} />;
}
