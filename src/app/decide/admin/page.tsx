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
import { ADMIN_PAGE_SIZE, adminTotals, listUsers } from "@/features/plans/admin";
import { COUNTED, ROLES } from "@/features/plans/plans";
import { formatPaise } from "@/features/referrals/lib";
import { referralAdmin } from "@/features/referrals/service";
import { setUserAccess, settleReferrals } from "./actions";

// Owners and admins only (anyone else: not found). Accounts, their plans and today's use, and the site's totals.

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
const PATH = "/decide/admin";
const schema = z.object({ q: z.string().trim().max(100).optional(), page: pageValue.default(1), msg: z.string().max(20).optional() });
const MESSAGES: Record<string, string> = {
  saved: "Saved.",
  invalid: "Not saved: check the fields.",
  not_found: "Not saved: no such account.",
  own_role: "Not saved: you can't change your own role.",
  owner_only: "Not saved: only an owner can grant or change Owner and Admin.",
  paid_out: "Referral earnings marked paid out.",
  voided: "Referral earnings voided.",
  nothing_pending: "Nothing changed: those earnings are no longer pending.",
};

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
const isoDay = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : "");
const n = (x: number) => x.toLocaleString("en-IN");

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await staffUser();
  if (!me) notFound();
  const f = parseSearchParams(schema, toURLSearchParams(await searchParams));
  const [users, totals, refs] = await Promise.all([listUsers(f.q || undefined, f.page), adminTotals(), referralAdmin()]);
  const href = (page: number) => `${PATH}?${new URLSearchParams({ ...(f.q && { q: f.q }), page: String(page) })}`;

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Admin" about="Accounts, plans, usage and referral payouts. Roles, Season Pass dates and payouts change here; every change is logged." />
      {f.msg && MESSAGES[f.msg] && <p role="status" className="rounded-md border border-border bg-card px-3 py-2 text-sm">{MESSAGES[f.msg]}</p>}

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
                  <td className={tbl.td}>
                    {u.plan.staff ? u.role[0] + u.role.slice(1).toLowerCase() : u.plan.plan === "PREMIUM" ? (u.plan.freeUntil ? "Free for all" : "Season Pass") : "Free"}
                  </td>
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
    </AppPage>
  );
}

function SmallTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className={tbl.wrap}>
      <table className={tbl.table}>
        <caption className="px-3 py-2 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className={tbl.headRow}>{head.map((h) => <th key={h} scope="col" className={tbl.th}>{h}</th>)}</tr>
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
