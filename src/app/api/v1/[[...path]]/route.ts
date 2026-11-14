import { handle, notFound } from "@/features/decide/api";

/**
 * /api/v1 itself and any other /api/v1 path: the JSON error envelope, not the HTML 404 page (signed-out callers get the
 * same 401 first). GET only: src/middleware.ts answers every other method on /api/v1 with a JSON 405.
 */
export const GET = () => handle(async () => notFound("No such endpoint"));
