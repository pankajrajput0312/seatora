// ponytail: in-memory fixed window, per server instance. Swap for Redis/Upstash
// or a DB-backed counter if deployed across many serverless instances.
const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if `key` is still under `limit` requests per `windowMs`. */
export function allow(key: string, limit = 5, windowMs = 60_000, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
