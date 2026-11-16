import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canUseDecide } from "@/features/auth/lib/session";
import { rankValue, readParams } from "./lib/params";
import { reachOrder } from "./lib/reach";
import { profileInput, profileSchema } from "./profile";
import { renamedCollege } from "./service";
import { baseCategories, optionSorts, optionsViews, rounds, seatKinds, type SeatList, type Source } from "./types";

// Query schemas and response helpers for the /api/v1 route handlers (thin wrappers over service.ts).
// Lists accept repeated or comma-separated params: ?sp=A&sp=B or ?sp=A,B. Profile params use the URL keys of
// profile.ts (rank, cat, pwd, sp, deg, c, quota, st, fee, bond).

const int = z.coerce.number().int();
const bool = z.enum(["0", "1", "true", "false"]).transform((v) => v === "1" || v === "true");
const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;

export const pageSchema = z.object({ page: int.min(1).default(1), pageSize: int.min(1).max(200).default(50) });

export const optionsQuerySchema = pageSchema.extend({
  q: z.string().trim().max(100).optional(),
  reach: z.array(z.enum(reachOrder)).default([]),
  /** Options that closed before her rank: shown (1) or hidden (0); absent = the view's default (round: shown, all: hidden). */
  showClosed: bool.optional(),
  /** "0" leaves the provisional 2026 R1 out of the reach labels. */
  prov: bool.default(true),
  /**
   * Seats in the newest round's lists: 1/true (the clear vacancy list) or one kind (clear, virtual, new), "any" list, or
   * 0/false/"all" = with or without; absent = the view's default (round: any, all: with or without).
   */
  hasSeats: z
    .enum(["0", "1", "true", "false", "any", "all", ...seatKinds])
    .transform((v) => (v === "1" || v === "true" ? "clear" : v === "0" || v === "false" || v === "all" ? false : v))
    .optional(),
  /** "round" or "all" (types.ts optionsViews); absent = the data's default (service.ts optionsView). */
  view: z.enum(optionsViews).optional(),
  /** types.ts optionSorts; absent = by label. */
  sort: z.enum(optionSorts).optional(),
});
/** Repeated ids count once (deduped before the limit of 4). */
export const compareQuerySchema = z.object({
  ids: z.array(z.string().min(1).max(200)).transform((ids) => [...new Set(ids)]).pipe(z.array(z.string()).min(1).max(4)),
});
export const collegesQuerySchema = pageSchema.extend({
  q: z.string().trim().max(100).optional(),
  state: z.string().optional(),
  course: z.string().optional(),
  sort: z.enum(["name", "allotments"]).default("name"),
});
export const cutoffsQuerySchema = pageSchema.extend({
  specialty: z.string().regex(/^[A-Z0-9]+$/, "Specialty code, e.g. ANAESTHESIOLOGY"),
  degree: z.string().optional(),
  quota: z.string().optional(),
  category: z.enum(categories).optional(),
  years: z.array(int.min(2000).max(2100)).default([]),
});
export const allotmentsQuerySchema = pageSchema
  .extend({
    year: int.min(2000).max(2100).optional(),
    round: z.enum(rounds).optional(),
    course: z.string().optional(),
    quota: z.string().optional(),
    category: z.enum(categories).optional(),
    state: z.string().optional(),
    from: rankValue.optional(),
    to: rankValue.optional(),
    college: z.string().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must be ≤ to", path: ["from"] });
export const rankScanQuerySchema = z.object({
  rank: rankValue,
  year: int.min(2000).max(2100).default(2025),
  window: int.min(1).max(1000).default(500),
});
export const trendsQuerySchema = pageSchema.extend({ specialty: z.string().optional(), degree: z.string().optional() });

type Issue = { path: string; message: string };
export type ApiResult<T> =
  | { ok: true; data: T; page?: { page: number; pageSize: number; total: number }; sources: Provenance[] }
  | { ok: false; error: { code: string; message: string; issues?: Issue[] } };
/** Where a block's numbers come from: the MCC result PDFs (with provisional flag) or a fee/stipend document. */
export type Provenance = Pick<Source, "name" | "url"> & Partial<Pick<Source, "key" | "year" | "round" | "provisional">>;
/** The page block of a paginated response (`total` = every matching row). */
export const pageOf = (r: { page: number; pageSize: number; total: number }) => ({ page: r.page, pageSize: r.pageSize, total: r.total });

const issues = (e: z.ZodError): Issue[] => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

/** Parses params strictly (bad input is a 400); `lists` are read as repeated/comma-separated values; empty values count as absent. */
export function parseQuery<S extends z.ZodType>(schema: S, p: URLSearchParams, lists: string[] = []) {
  return schema.safeParse(readParams(p, lists)) as z.ZodSafeParseResult<z.infer<S>>;
}

/** Strict profile from the profile URL params (rank required); invalid values are errors, not defaults. */
export const parseProfile = (p: URLSearchParams) => profileSchema.safeParse(profileInput(p));
/** Same, but no rank means no profile. */
export const parseOptionalProfile = (p: URLSearchParams) => (p.get("rank")?.trim() ? parseProfile(p) : ({ success: true, data: null, error: undefined } as const));

const headers = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" };

export function ok<T>(data: T, extra: { sources: Provenance[]; page?: { page: number; pageSize: number; total: number } }) {
  return Response.json({ ok: true, ...extra, data } satisfies ApiResult<T>, { headers });
}

export function invalid(...errors: (z.ZodError | undefined)[]) {
  const all = errors.flatMap((e) => (e ? issues(e) : []));
  return Response.json({ ok: false, error: { code: "invalid_query", message: "Invalid query parameters", issues: all } } satisfies ApiResult<never>, { status: 400 });
}

export const notFound = (message: string) => Response.json({ ok: false, error: { code: "not_found", message } } satisfies ApiResult<never>, { status: 404 });

/** An institute endpoint under an old slug (its college key was retired): 308 to the same path under the slug now; else 404. */
export async function renamedOr404(req: Request, slug: string) {
  const to = await renamedCollege(slug);
  if (!to) return notFound("No institute with this slug");
  const url = new URL(req.url);
  return new Response(null, { status: 308, headers: { Location: `${url.pathname.replace(`/colleges/${slug}`, `/colleges/${to.slug}`)}${url.search}` } });
}

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Most rows one CSV export writes (/api/v1/options/export, /api/v1/seats/export; ~2.5 MB at most): more is a 400 that
 * says to narrow the filters, never a cut file. The pages show that instead of the Download link.
 */
export const CSV_MAX_ROWS = 5000;
export const tooManyRows = (total: number) =>
  Response.json(
    { ok: false, error: { code: "too_many_rows", message: `${total} rows match these filters; a CSV download holds at most ${CSV_MAX_ROWS}. Narrow the filters and download again.` } } satisfies ApiResult<never>,
    { status: 400, headers: noStore },
  );

/** No database configured, or Postgres unreachable, timed out or out of connections: data unavailable, not a bug. */
export const isDataUnavailable = (e: unknown) =>
  e instanceof Prisma.PrismaClientInitializationError ||
  (e instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(e.code)) ||
  (e instanceof Error && e.name === "DataUnavailableError");

/**
 * Runs a handler for a signed-in, allowlisted user with a live session (src/middleware.ts checks only the access
 * cookie, so a copied cookie after sign-out gets a 401 here); errors are logged and answered without details: 503
 * data_unavailable when the database is missing or down, else 500.
 */
export async function handle(fn: () => Promise<Response>) {
  try {
    if (!(await canUseDecide()))
      return Response.json({ ok: false, error: { code: "unauthorized", message: "Sign in with an allowed account." } } satisfies ApiResult<never>, { status: 401, headers: noStore });
    return await fn();
  } catch (e) {
    console.error("[api/v1]", e);
    if (isDataUnavailable(e))
      return Response.json({ ok: false, error: { code: "data_unavailable", message: "The MCC data is not available right now" } } satisfies ApiResult<never>, { status: 503, headers: { ...noStore, "Retry-After": "60" } });
    return Response.json({ ok: false, error: { code: "internal_error", message: "Something went wrong" } } satisfies ApiResult<never>, { status: 500, headers: noStore });
  }
}

/** The seat list behind an R2 seats column, as a source. */
export const seatListSource = (l: SeatList | null): Provenance[] => (l ? [{ key: l.key, name: l.name, url: l.url, year: l.year, round: l.round }] : []);

/** The result PDFs behind the given year/round pairs (all when `used` is omitted). */
export function sourcesFor(sources: Source[], used?: Iterable<{ year: number; round: string }>): Provenance[] {
  const keys = used && new Set([...used].map((u) => `${u.year}|${u.round}`));
  return sources.filter((s) => !keys || keys.has(`${s.year}|${s.round}`)).map((s) => ({ key: s.key, name: s.name, url: s.url, year: s.year, round: s.round, provisional: s.provisional }));
}

/** Year/round pairs present in option rows' grids. */
export const gridRounds = (rows: { grid: Record<number, Partial<Record<string, unknown>>> }[]) =>
  rows.flatMap((r) => Object.entries(r.grid).flatMap(([year, g]) => Object.keys(g).map((round) => ({ year: Number(year), round }))));
