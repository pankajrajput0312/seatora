import type { Metadata } from "next";
import { z } from "zod";
import { siteConfig } from "@/config/site";
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

export const metadata: Metadata = { title: "Help & feedback", robots: { index: false, follow: false } };
const PATH = "/decide/requests";
// Own keys (status, kind, about): never a profile key. `about`: a college page's "Report wrong data" (its name).
const schema = z.object({ status: z.enum(REQUEST_STATUSES).optional(), kind: z.enum(REQUEST_KINDS).optional(), page: pageValue.default(1), about: z.string().trim().max(200).optional() });

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDecideAccess(PATH);
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  // listAllRequests is null for anyone but the owner.
  const [user, mine, all] = await Promise.all([getCurrentUser(), listMyRequests(), listAllRequests(f)]);
  const whatsapp = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.replace(/[^\d+]/g, "");

  return (
    <AppPage className="grid grid-cols-1 gap-4">
      <PageHead
        title="Help & feedback"
        about={
          <>
            Wrong data, a feature you need, or anything else. We read every message and reply by email to your account&apos;s address
            within 2 working days. What you send is listed below with its status: new, planned, done or declined.
          </>
        }
      >
        Report wrong data, ask for a feature, or contact us.
      </PageHead>

      <section id="report" aria-labelledby="report-h" className="grid max-w-2xl scroll-mt-24 gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div>
          <h2 id="report-h" className="text-lg font-semibold">Report wrong data</h2>
          <p className="text-sm text-muted-foreground">A fee, bond, seat, closing rank or name that doesn&apos;t match the official document: name the college and what&apos;s wrong. We check it against the source and fix it.</p>
        </div>
        <RequestForm email={user?.email} page={PATH} kinds={["data"]} message={f.about ? `${f.about}: ` : ""} />
      </section>

      <section aria-labelledby="feature-h" className="grid max-w-2xl gap-3 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 id="feature-h" className="text-lg font-semibold">Request a feature</h2>
        <RequestForm email={user?.email} page={PATH} kinds={["feature", "customization", "other"]} />
      </section>

      {(siteConfig.contactEmail || whatsapp) && (
        <section aria-labelledby="contact-h" className="grid max-w-2xl gap-1 text-sm">
          <h2 id="contact-h" className="text-lg font-semibold">Contact us</h2>
          {siteConfig.contactEmail && <p>Email: <a href={`mailto:${siteConfig.contactEmail}`} className="break-all text-sky underline">{siteConfig.contactEmail}</a></p>}
          {whatsapp && <p>WhatsApp: <a href={`https://wa.me/${whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className="numeric text-sky underline">{whatsapp}</a></p>}
        </section>
      )}

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
