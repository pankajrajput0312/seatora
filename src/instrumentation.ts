import type { Instrumentation } from "next";

// Server errors (render, route handlers, Server Actions) are grouped in ErrorGroup and alerted on (features/funnel
// service.ts recordError, docs/FUNNEL.md). The route is its pattern (/decide/institutes/[slug]), never the query; the
// request's body and headers are not read. Node only (Prisma): the Edge middleware's errors stay in the logs.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The import inside the check, so the Edge bundle (where NEXT_RUNTIME is "edge") never includes it.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordError } = await import("@/features/funnel/service");
    const e = err as Error & { digest?: string };
    await recordError({ message: e?.message ?? String(err), digest: e?.digest, route: context.routePath || request.path, method: request.method, kind: "server" });
  }
};
