"use client";

import { useTrying } from "../lib/use-decide-store";

/** `saved` for her saved rank, `tried` while she is trying one (useTrying: the address's rank isn't her saved one). */
export const TryingText = ({ saved, tried }: { saved: string; tried: string }) => <>{useTrying() ? tried : saved}</>;
