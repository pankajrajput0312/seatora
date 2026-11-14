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
