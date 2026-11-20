// The list pages' sort comparators (Options, Institutes, Rank scan, an institute's Courses): pure, so a test pins them.
// A row with no value goes last either way; ties return 0, so Array.prototype.sort (stable) keeps the order it had.

type Key<T, V> = (x: T) => V | null | undefined;
export type Cmp<T> = (a: T, b: T) => number;

const missing = (x: unknown, y: unknown) => Number(x == null) - Number(y == null);

/** By a number: lowest first, or highest first with "desc"; no value (null, undefined, NaN) last. */
export const byNumber =
  <T>(key: Key<T, number>, dir: "asc" | "desc" = "asc"): Cmp<T> =>
  (a, b) => {
    const [x, y] = [key(a), key(b)].map((v) => (v == null || Number.isNaN(v) ? null : v));
    if (x == null || y == null) return missing(x, y);
    return dir === "asc" ? x - y : y - x;
  };

/** By text, A to Z (locale order, case and accents aside); no text last. */
export const byText =
  <T>(key: Key<T, string>): Cmp<T> =>
  (a, b) => {
    const [x, y] = [key(a) || null, key(b) || null];
    if (x == null || y == null) return missing(x, y);
    return x.localeCompare(y, "en", { sensitivity: "base", numeric: true });
  };

/** The first comparator that tells two rows apart. */
export const chain =
  <T>(...cmps: Cmp<T>[]): Cmp<T> =>
  (a, b) => {
    for (const c of cmps) {
      const d = c(a, b);
      if (d) return d;
    }
    return 0;
  };
