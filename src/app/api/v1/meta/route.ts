import { handle, ok, sourcesFor } from "@/features/decide/api";
import { getMeta } from "@/features/decide/service";

/** Filter vocabularies (courses, specialties, degrees, quotas, states), years with their rounds, and the result PDFs behind the data. */
export async function GET() {
  return handle(async () => {
    const meta = await getMeta();
    return ok(meta, { sources: sourcesFor(meta.sources) });
  });
}
