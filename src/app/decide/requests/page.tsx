import type { Metadata } from "next";
import { z } from "zod";
import { getCurrentUser, requireDecideAccess } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { toURLSearchParams } from "@/features/decide/profile";
import { firstLine, requestDate, RequestStatusChip, statusLabel } from "@/features/requests/components/request-bits";
import { RequestForm } from "@/features/requests/components/request-form";
import { RequestStatusSelect } from "@/features/requests/components/request-status-select";
import { listAllRequests, listMyRequests } from "@/features/requests/server";
import { REQUEST_KINDS, REQUEST_STATUSES, requestKindLabel } from "@/features/requests/validations";

export const metadata: Metadata = { title: "Request a feature", robots: { index: false, follow: false } };
const PATH = "/decide/requests";
// Own keys (status, kind): never a profile key.
const schema = z.object({ status: z.enum(REQUEST_STATUSES).optional(), kind: z.enum(REQUEST_KINDS).optional(), page: pageValue.default(1) });

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDecideAccess(PATH);
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  // listAllRequests is null for anyone but the owner.
  const [user, mine, all] = await Promise.all([getCurrentUser(), listMyRequests(), listAllRequests(f)]);

  return (
    <AppPage className="grid grid-cols-1 gap-8">
      <PageHead title="Request a feature">Ask for a new feature, a change for your own use, a data correction or anything else. We read every request and reply by email.</PageHead>

      <section aria-label="New request" className="max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-6">
        <RequestForm email={user?.email} page={PATH} />
      </section>

      <section aria-labelledby="mine-h" className="grid max-w-2xl grid-cols-1 gap-3">
        <h2 id="mine-h" className="text-lg font-semibold">Your requests</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Requests you send appear here with their status.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {mine.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{requestKindLabel[r.kind]} · <time dateTime={r.createdAt}>{requestDate(r.createdAt)}</time></p>
                  <p className="mt-0.5 truncate">{firstLine(r.message)}</p>
                </div>
                <RequestStatusChip status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {all && (
        <section aria-labelledby="all-h" className="grid grid-cols-1 gap-3">
          <h2 id="all-h" tabIndex={-1} className="text-lg font-semibold">All requests</h2>
          <FilterBar action={PATH} params={params} cols="md:grid-cols-[1fr_1fr_auto]">
            <Field label="Status"><Select name="status" value={f.status} all="Any status" options={REQUEST_STATUSES.map((s) => ({ value: s, label: statusLabel[s] }))} /></Field>
            <Field label="Kind"><Select name="kind" value={f.kind} all="Any kind" options={REQUEST_KINDS.map((k) => ({ value: k, label: requestKindLabel[k] }))} /></Field>
          </FilterBar>
          <p aria-live="polite" className="text-sm text-muted-foreground"><span className="numeric font-semibold text-foreground">{rangeLabel(all)}</span> requests</p>
          {all.total === 0 ? (
            f.status || f.kind ? <EmptyState headingLevel={3} title="No requests match these filters." href={L.to(PATH)} /> : <EmptyState headingLevel={3} title="No requests yet." />
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {all.rows.map((r) => (
                <li key={r.id} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{requestKindLabel[r.kind]}</p>
                      <p className="text-muted-foreground">
                        <time dateTime={r.createdAt}>{requestDate(r.createdAt)}</time>
                        {r.email && <> · <a href={`mailto:${r.email}`} className="break-all text-sky underline">{r.email}</a></>}
                        {r.page && <> · from <span className="break-all">{r.page}</span></>}
                      </p>
                      {/* The typed email and page are the sender's word; only the account is checked. */}
                      <p className="break-all text-muted-foreground">{r.account ? `Signed in as ${r.account}` : "No account: email not verified"}</p>
                    </div>
                    <RequestStatusSelect id={r.id} status={r.status} label={`${requestKindLabel[r.kind]} from ${r.email ?? "unknown"}, ${requestDate(r.createdAt)}`} />
                  </div>
                  {/* Plain text: React escapes it; pre-wrap keeps her line breaks. */}
                  <p className="whitespace-pre-wrap wrap-anywhere text-sm">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
          <Pager page={all.page} pageSize={all.pageSize} total={all.total} href={(n) => L.page(PATH, n)} focusId="all-h" label="All requests" />
        </section>
      )}
    </AppPage>
  );
}
