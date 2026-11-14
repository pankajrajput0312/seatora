import { handle, ok } from "@/features/decide/api";
import { retiredKeys } from "@/features/decide/service";

/**
 * College keys that MCC data imports retired (two colleges merged, or a name replaced by a neutral label) → the college
 * each is now ({ key, slug, name }). Keyed by the old key, or "sha256:<hex>" of it where the key held a person's name.
 * Only retired keys: the browser renames option ids saved under them (choices, compare).
 */
export async function GET() {
  return handle(async () => ok(await retiredKeys(), { sources: [] }));
}
