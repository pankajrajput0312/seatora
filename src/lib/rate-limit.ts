// ponytail: in-memory fixed window, per server instance. Swap for Redis/Upstash
// or a DB-backed counter if deployed across many serverless instances.
const hits = new Map<string, { count: number; resetAt: number }>();

function live(key: string, now: number) {
  const entry = hits.get(key);
  return entry && entry.resetAt > now ? entry : undefined;
}

/** Records a hit and returns true if `key` is still within `limit` per `windowMs`. */
export function allow(key: string, limit = 5, windowMs = 60_000, now = Date.now()): boolean {
  const entry = live(key, now);
  if (!entry) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** True if `key` has already reached `limit` in its current window. Does not record a hit. */
export function isLimited(key: string, limit: number, now = Date.now()): boolean {
  return (live(key, now)?.count ?? 0) >= limit;
}

export function reset(key: string) {
  hits.delete(key);
}
