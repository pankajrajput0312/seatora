import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { staffUser } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { Pager, smallLink, tbl } from "@/features/decide/components/ui";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { toURLSearchParams } from "@/features/decide/profile";
import { funnelReport, possibleDuplicates, RANGES, recentErrors, type Range } from "@/features/funnel/admin";
import { STAGES } from "@/features/funnel/lib";
import { couponAdmin } from "@/features/payments/service";
import { ADMIN_PAGE_SIZE, adminTotals, listUsers } from "@/features/plans/admin";
import { COUNTED, ROLES, type Effective, type Role } from "@/features/plans/plans";
import { formatPaise } from "@/features/referrals/lib";
import { referralAdmin } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import { createCoupon, resolveError, setUserAccess, settleReferrals, updateCoupon } from "./actions";

// Owners and admins only (anyone else: not found). The upgrade funnel, accounts, their plans and today's use, the
// site's totals, possible duplicate accounts and server/browser errors (docs/FUNNEL.md).

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
const PATH = "/decide/admin";
const schema = z.object({
  q: z.string().trim().max(100).optional(),
  page: pageValue.default(1),
  msg: z.string().max(20).optional(),
  range: z.enum(Object.keys(RANGES) as [Range, ...Range[]]).default("7d"),
});
const MESSAGES: Record<string, string> = {
  saved: "Saved.",
  invalid: "Not saved: check the fields.",
  not_found: "Not saved: no such account.",
  own_role: "Not saved: you can't change your own role.",
  owner_only: "Not saved: only an owner can grant or change Owner and Admin.",
  paid_out: "Referral earnings marked paid out.",
  voided: "Referral earnings voided.",
  nothing_pending: "Nothing changed: those earnings are no longer pending.",
  resolved: "Error marked resolved; it reopens if it happens again.",
  coupon_saved: "Coupon saved.",
  coupon_exists: "Not saved: a coupon with that code already exists.",
};

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
const isoDay = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : "");
const n = (x: number) => x.toLocaleString("en-IN");
const pct = (x: number | null) => (x == null ? "—" : `${x}%`);
const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const planLabel = (u: { role: Role; plan: Effective }) =>
  u.plan.staff ? u.role[0] + u.role.slice(1).toLowerCase() : u.plan.plan === "PREMIUM" ? (u.plan.freeUntil ? "Free for all" : "Season Pass") : "Free";
const field = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await staffUser();
  if (!me) notFound();
  const f = parseSearchParams(schema, toURLSearchParams(await searchParams));
  const [users, totals, refs, fun, dupes, errors, coupons] = await Promise.all([
    listUsers(f.q || undefined, f.page),
    adminTotals(),
    referralAdmin(),
    funnelReport(f.range),
    possibleDuplicates(),
    recentErrors(),
    couponAdmin(),
  ]);
  const people = (c: { events: number; people: number }) => [n(c.events), n(c.people)];
  const href = (page: number) => `${PATH}?${new URLSearchParams({ ...(f.q && { q: f.q }), page: String(page) })}`;

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Admin" about="The upgrade funnel, accounts, plans, usage, referral payouts, coupons, possible duplicate accounts and errors. Roles, Season Pass dates, payouts and coupons change here; every change is logged." />
      {f.msg && MESSAGES[f.msg] && <p role="status" className="rounded-md border border-border bg-card px-3 py-2 text-sm">{MESSAGES[f.msg]}</p>}

      <section aria-labelledby="funnel-h" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="funnel-h" className="scroll-mt-24 text-lg font-semibold">Funnel</h2>
          <nav aria-label="Funnel range" className="flex overflow-hidden rounded-md border border-input text-sm">
            {(Object.keys(RANGES) as Range[]).map((r) => (
              <Link key={r} href={`${PATH}?range=${r}#funnel-h`} aria-current={r === f.range ? "page" : undefined} className={cn("inline-flex min-h-9 items-center px-3", r === f.range ? "bg-foreground font-semibold text-background" : "hover:bg-muted")}>
                {RANGES[r]}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-sm text-muted-foreground">
          Unique people per stage: the account when signed in, else the browser&apos;s device cookie. Bots are not counted. Each stage is
          counted on its own, so a step can pass 100% when people start further in (a shared sign-up link skips the home page).
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <SmallTable caption={`Upgrade funnel, ${RANGES[f.range].toLowerCase()}`} head={["Stage", "People", "Step", "Overall"]} rows={fun.stages.map((s) => [s.label, n(s.people), pct(s.step), pct(s.overall)])} />
          <div className="grid content-start gap-4">
            <SmallTable caption="Upgrade clicks by placement" head={["Placement", "Clicks", "People"]} rows={fun.placements.map((p) => [p.placement ?? "—", ...people(p)])} />
            <SmallTable
              caption="Checkout"
              head={["Outcome", "Events", "People"]}
              rows={[
                ["Opened", ...people(fun.checkout.opened)],
                ["Cancelled", ...people(fun.checkout.cancelled)],
                ["Failed", ...people(fun.checkout.failed)],
                ["Paid", ...people(fun.checkout.paid)],
                ["Revenue (paid payments)", formatPaise(fun.checkout.revenue), ""],
              ]}
            />
          </div>
          <SmallTable
            caption="Referrals"
            head={["Step", "Events", "People"]}
            rows={[
              ["Link opens", ...people(fun.referrals.opens)],
              ["Referred sign-ups", ...people(fun.referrals.signups)],
              ["Referred and paid", ...people(fun.referrals.paid)],
              ["Earnings (not void)", formatPaise(fun.referrals.earnings), ""],
            ]}
          />
          <SmallTable caption="Paywall hits by feature" head={["Feature", "Hits", "People"]} rows={fun.paywall.map((p) => [p.feature ?? "—", ...people(p)])} />
        </div>
        <SmallTable caption="Last 14 days (IST): unique people per stage" head={["Day", ...STAGES.map((s) => s.short)]} rows={fun.days.map((d) => [day(new Date(`${d.day}T12:00:00+05:30`)), ...d.stages.map((s) => n(s.people))])} />
      </section>

      <section aria-labelledby="totals-h" className="grid gap-4">
        <h2 id="totals-h" className="text-lg font-semibold">Totals</h2>
        <p className="text-sm">
          Accounts by role: {ROLES.map((r) => `${r[0]}${r.slice(1).toLowerCase()} ${n(totals.byRole[r] ?? 0)}`).join(" · ")}
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <SmallTable caption="Sign-ups per day (IST)" head={["Day", "Sign-ups"]} rows={totals.signups.map((r) => [day(r.day), n(r.n)])} />
          <SmallTable caption="Use per feature per day" head={["Day", "Feature", "Uses", "Accounts"]} rows={totals.usage.map((r) => [day(r.day), r.feature, n(r.n), n(r.users)])} />
          <SmallTable
            caption="Ask Seatora per day (list prices)"
            head={["Day", "Runs", "Tokens in / out", "Cost"]}
            rows={totals.ask.map((r) => [day(r.day), n(r.runs), `${n(r.input + r.cacheWrite)} / ${n(r.output)}`, `$${r.usd.toFixed(2)}`])}
          />
        </div>
      </section>

      <section aria-labelledby="referrals-h" className="grid gap-3">
        <h2 id="referrals-h" className="text-lg font-semibold">Referrals</h2>
        <p className="text-sm">
          Pending {formatPaise(refs.pending.amount)} ({n(refs.pending.n)}) · Paid out {formatPaise(refs.paidOut.amount)} ({n(refs.paidOut.n)}) · Void{" "}
          {formatPaise(refs.void.amount)} ({n(refs.void.n)}) · Accounts signed up through a link {n(refs.referred)}
        </p>
        {refs.groups.length ? (
          <div className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Pending payouts by referrer</caption>
              <thead>
                <tr className={tbl.headRow}>
                  {["Referrer", "UPI", "Pending", "Payments", "Buyers", "Pay out"].map((h) => <th key={h} scope="col" className={tbl.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {refs.groups.map((g) => (
                  <tr key={g.referrerId} className={tbl.row}>
                    <td className={tbl.td}>{g.email}</td>
                    <td className={tbl.td}>{g.upi ?? "—"}</td>
                    <td className={tbl.num}>{formatPaise(g.amount)}</td>
                    <td className={tbl.num}>{g.earnings.length}</td>
                    <td className={`${tbl.td} text-xs`}>
                      {g.earnings.map((e) => <span key={e.id} className="block">{e.buyer} <span className="numeric text-muted-foreground">{formatPaise(e.amount)}, {day(e.createdAt)}</span></span>)}
                    </td>
                    <td className={tbl.td}>
                      <form action={settleReferrals} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="referrerId" value={g.referrerId} />
                        <input type="hidden" name="ids" value={g.earnings.map((e) => e.id).join(",")} />
                        <input name="note" maxLength={500} placeholder="UPI reference or reason" aria-label={`Note for ${g.email}`} className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm" />
                        <button type="submit" name="to" value="paid_out" className="inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-semibold text-background">Mark paid out</button>
                        <button type="submit" name="to" value="void" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold">Void</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pending payouts.</p>
        )}
      </section>

      <section aria-labelledby="coupons-h" className="grid gap-3">
        <h2 id="coupons-h" className="scroll-mt-24 text-lg font-semibold">Coupons</h2>
        <form action={createCoupon} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="grid gap-1">Code<input name="code" required pattern="[A-Za-z0-9]{3,20}" maxLength={20} placeholder="DRTARAL" className={`${field} w-32 uppercase`} /></label>
          <label className="grid gap-1">% off<input name="percentOff" type="number" required min={1} max={100} defaultValue={100} className={`${field} w-20`} /></label>
          <label className="grid gap-1">Max uses<input name="maxUses" type="number" min={1} placeholder="No limit" className={`${field} w-28`} /></label>
          <label className="grid gap-1">Only for email<input name="allowedEmail" type="email" maxLength={200} placeholder="Anyone" className={`${field} w-48`} /></label>
          <label className="grid gap-1">Valid until<input name="validUntil" type="date" className={field} /></label>
          <label className="grid gap-1">Note<input name="note" maxLength={500} className={`${field} w-48`} /></label>
          <button type="submit" className="inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-semibold text-background">Create coupon</button>
        </form>
        {coupons.length ? (
          <div className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Coupons, newest first</caption>
              <thead>
                <tr className={tbl.headRow}>
                  {["Code", "% off", "Uses / max", "Active", "Note", "Redeemed by", "Max uses, only for email, valid until"].map((h) => <th key={h} scope="col" className={tbl.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className={tbl.row}>
                    <td className={`${tbl.td} font-semibold`}>{c.code}</td>
                    <td className={tbl.num}>{c.percentOff}%</td>
                    <td className={tbl.num}>{n(c.uses)} / {c.maxUses == null ? "∞" : n(c.maxUses)}</td>
                    <td className={tbl.td}>{c.active ? "Yes" : "No"}</td>
                    <td className={`${tbl.td} text-xs`}>{c.note ?? "—"}</td>
                    <td className={`${tbl.td} text-xs`}>
                      {c.redemptions.length ? c.redemptions.map((r) => <span key={r.id} className="block">{r.user.email} <span className="numeric text-muted-foreground">{day(r.createdAt)}</span></span>) : "—"}
                    </td>
                    <td className={tbl.td}>
                      <form action={updateCoupon} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="maxUses" type="number" min={1} defaultValue={c.maxUses ?? ""} placeholder="No limit" aria-label={`Max uses of ${c.code}`} className={`${field} w-24`} />
                        <input name="allowedEmail" type="email" maxLength={200} defaultValue={c.allowedEmail ?? ""} placeholder="Anyone" aria-label={`Only for email (${c.code})`} className={`${field} w-44`} />
                        <input name="validUntil" type="date" defaultValue={isoDay(c.validUntil)} aria-label={`Valid until (${c.code})`} className={field} />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold">Save</button>
                      </form>
                      <form action={updateCoupon} className="mt-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold">{c.active ? "Deactivate" : "Activate"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No coupons yet.</p>
        )}
      </section>

      <section aria-labelledby="users-h" className="grid gap-3">
        <h2 id="users-h" className="text-lg font-semibold">Accounts <span className="numeric text-sm font-normal text-muted-foreground">({n(users.total)})</span></h2>
        <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="admin-q">Email or name</label>
          <input id="admin-q" name="q" defaultValue={f.q} maxLength={100} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <button type="submit" className="inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-semibold text-background">Search</button>
          {f.q && <Link href={PATH} className={smallLink}>Clear</Link>}
        </form>
        <div className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Accounts, newest first</caption>
            <thead>
              <tr className={tbl.headRow}>
                {["Email", "Plan", "Created", "Last active", "Today", "Role, Season Pass until, notes"].map((h) => <th key={h} scope="col" className={tbl.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.rows.map((u) => (
                <tr key={u.id} className={tbl.row}>
                  <td className={tbl.td}>
                    <span className="block font-medium">{u.email}</span>
                    <span className="block text-xs text-muted-foreground">{u.name}</span>
                  </td>
                  <td className={tbl.td}>{planLabel(u)}</td>
                  <td className={`${tbl.td} numeric`}>{day(u.createdAt)}</td>
                  <td className={`${tbl.td} numeric`}>{day(u.lastActive)}</td>
                  <td className={`${tbl.td} numeric text-xs`}>{COUNTED.map((c) => `${c} ${u.today[c] ?? 0}`).join(", ")}</td>
                  <td className={tbl.td}>
                    <form action={setUserAccess} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="q" value={f.q ?? ""} />
                      <select name="role" defaultValue={u.role} aria-label={`Role of ${u.email}`} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        {ROLES.map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}
                      </select>
                      <input type="date" name="premiumUntil" defaultValue={isoDay(u.premiumUntil)} aria-label={`Season Pass until (${u.email})`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                      <input name="notes" defaultValue={u.notes ?? ""} maxLength={500} placeholder="Notes" aria-label={`Notes on ${u.email}`} className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm" />
                      <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={f.page} pageSize={ADMIN_PAGE_SIZE} total={users.total} href={href} focusId="users-h" label="Accounts" />
      </section>

      <section aria-labelledby="dupes-h" className="grid gap-3">
        <h2 id="dupes-h" className="text-lg font-semibold">Possible duplicates</h2>
        <p className="text-sm text-muted-foreground">Accounts made on the same device, or on the same network within 24 hours. Hostels share networks: look before acting. Nothing happens automatically.</p>
        {dupes.length ? (
          <div className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Groups of accounts that may be one person, newest first</caption>
              <thead>
                <tr className={tbl.headRow}>
                  {["Same", "Email", "Created", "Plan", "Paid", ""].map((h, i) => <th key={i} scope="col" className={tbl.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {dupes.flatMap((g, gi) =>
                  g.users.map((u, i) => (
                    <tr key={`${gi}-${u.id}`} className={cn(tbl.row, i === 0 && gi > 0 && "border-t-2 border-t-border")}>
                      <td className={tbl.td}>{i === 0 ? `${g.via} (${g.users.length})` : ""}</td>
                      <td className={tbl.td}>{u.email}</td>
                      <td className={`${tbl.td} numeric`}>{day(u.createdAt)}</td>
                      <td className={tbl.td}>{planLabel(u)}</td>
                      <td className={tbl.td}>{u.paid ? "Paid" : "—"}</td>
                      <td className={tbl.td}>
                        <Link href={`${PATH}?${new URLSearchParams({ q: u.email })}#users-h`} className={`${smallLink} -my-3`}>Notes and role</Link>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None.</p>
        )}
      </section>

      <section aria-labelledby="errors-h" className="grid gap-3">
        <h2 id="errors-h" className="scroll-mt-24 text-lg font-semibold">Errors</h2>
        <p className="text-sm text-muted-foreground">
          Open server and browser errors seen in the last 7 days, grouped (numbers and ids aside). Resolved hides one until it happens again.
          {process.env.ALERT_WEBHOOK_URL ? " Alerts go to the webhook on a new error and at 10 and 100." : " ALERT_WEBHOOK_URL is not set: no alerts."}
        </p>
        {errors.length ? (
          <div className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Open error groups, most frequent first</caption>
              <thead>
                <tr className={tbl.headRow}>
                  {["Count", "Last seen", "Where", "Message", ""].map((h, i) => <th key={i} scope="col" className={tbl.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.fingerprint} className={tbl.row}>
                    <td className={tbl.num}>{n(e.count)}</td>
                    <td className={`${tbl.td} numeric whitespace-nowrap`}>{when(e.lastAt)}</td>
                    <td className={`${tbl.td} text-xs`}>
                      <span className="block font-mono">{e.route}</span>
                      <span className="block text-muted-foreground">{e.kind === "server" ? "Server" : "Browser"}{e.lastDigest ? ` · digest ${e.lastDigest}` : ""}</span>
                    </td>
                    <td className={`${tbl.td} max-w-xl text-xs break-words`}>{e.message}</td>
                    <td className={tbl.td}>
                      <form action={resolveError}>
                        <input type="hidden" name="fingerprint" value={e.fingerprint} />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-semibold">Resolved</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No open errors in the last 7 days.</p>
        )}
      </section>
    </AppPage>
  );
}

function SmallTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className={tbl.wrap}>
      <table className={tbl.table}>
        <caption className="px-3 py-2 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className={tbl.headRow}>{head.map((h, j) => <th key={h} scope="col" className={cn(tbl.th, j > 0 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i} className={tbl.row}>{r.map((c, j) => <td key={j} className={j ? tbl.num : tbl.td}>{c}</td>)}</tr>) : (
            <tr><td colSpan={head.length} className={tbl.td}>—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
