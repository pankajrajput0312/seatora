import { handle, notFound } from "@/features/decide/api";

/** Any other /api/v1 path: the JSON error envelope, not the HTML 404 page (signed-out callers get the same 401 first). */
const none = () => handle(async () => notFound("No such endpoint"));
export { none as DELETE, none as GET, none as PATCH, none as POST, none as PUT };
