import { z } from "zod";

// Zod parsing for Decide search params, shared by pages and the /api/v1 handlers.

/** Search params → plain object for a schema: `lists` read repeated or comma-joined values; empty values count as absent. */
export function readParams(p: URLSearchParams, lists: readonly string[] = []): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const k of new Set(p.keys())) {
    const v = lists.includes(k) ? p.getAll(k).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean) : p.get(k)?.trim();
    if (v && v.length) raw[k] = v;
  }
  return raw;
}

/** A rank as people type it: "30,000", "30 000" or "30000", 1 to 3,00,000 (one message for missing, malformed or out of range). */
export const rankValue = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
  z.coerce.number({ error: "Enter a rank from 1 to 3,00,000, e.g. 42,284" }).int().min(1).max(300000),
);

/**
 * A rank typed into a range filter: "40,000", "40k", "4.5L" / "4.5 lakh" (a whole rank, 1 or more). Null when empty;
 * "bad" when it is no rank (negative, zero, words).
 */
export function rankText(v: string | undefined): number | null | "bad" {
  const t = (v ?? "").trim().toLowerCase().replace(/[,\s]/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(k|l|lakh|lac|lakhs)?$/.exec(t);
  if (!m) return "bad";
  const n = Math.round(Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] ? 1e5 : 1));
  return n >= 1 ? n : "bad";
}
/** rankValue that also takes rankText's shorthand ("25k", "0.25L", "2.5 lakh"). */
export const rankShorthand = z.preprocess((v) => (typeof v === "string" && typeof rankText(v) === "number" ? rankText(v) : v), rankValue);
/** A closing-rank range from two typed ends: each read by rankText, swapped when typed the wrong way round (`swapped`). */
export function rankRange(from: string | undefined, to: string | undefined) {
  const [a, b] = [rankText(from), rankText(to)];
  const bad = [a === "bad" && from, b === "bad" && to].filter((x): x is string => !!x);
  const [min, max] = [a === "bad" ? null : a, b === "bad" ? null : b];
  const swapped = min != null && max != null && min > max;
  return { min: (swapped ? max : min) ?? undefined, max: (swapped ? min : max) ?? undefined, swapped, bad };
}

/** 1-based page number for server-side pagination. */
export const pageValue = z.coerce.number().int().min(1).max(100000);

/**
 * Page search params, leniently (ARCHITECTURE: invalid params fall back to defaults): any field that fails is dropped and
 * the schema's default or `undefined` applies. Use the HTTP API's parseQuery when bad input must be an error instead.
 */
export function parseSearchParams<S extends z.ZodType>(schema: S, p: URLSearchParams, lists: readonly string[] = []): z.infer<S> {
  const raw = readParams(p, lists);
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  for (const i of r.error.issues) delete raw[String(i.path[0])];
  return schema.parse(raw);
}
