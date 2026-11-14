import type { Metadata } from "next";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/features/decide/components/bits";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { getNotices } from "@/features/decide/service";

export const metadata: Metadata = { title: "Counselling" };
const tabs = [
  { key: "schedule", label: "Schedule", kind: "schedule" },
  { key: "announcements", label: "Announcements", kind: "announcement" },
  { key: "merit", label: "Merit lists", kind: "merit" },
] as const;

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function CounsellingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const tab = tabs.find((t) => t.key === params.get("tab")) ?? tabs[0];
  const notices = (await getNotices()).filter((n) => n.kind === tab.kind);
  const keep = new URLSearchParams();
  for (const k of profileParamKeys) if (params.get(k)) keep.set(k, params.get(k)!);
  const href = (key: string) => `/decide/counselling?${new URLSearchParams({ ...Object.fromEntries(keep), tab: key })}`;

  return (
    <AppPage className="py-6">
      <PageHead title="Counselling">MCC All India PG counselling 2026. Always confirm dates on the official site.</PageHead>
      <SubTabs label="Counselling" current={tab.key} items={tabs.map((t) => ({ key: t.key, label: t.label, href: href(t.key) }))} />

      <ol className="mt-6 grid gap-2">
        {notices.map((n) => {
          const open = n.status === "open";
          return (
            <li key={n.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="font-mono text-xs text-muted-foreground"><time dateTime={n.date} className="numeric">{fmt(n.date)}</time> · {n.authority}</p>
                <p className="mt-1">{n.title} {open && <Badge tone="info" className="ml-1 align-middle">Open now</Badge>}</p>
              </div>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-sky underline">
                Official page<span className="sr-only"> on the {n.authority} site (opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="mt-6"><DataSource /></div>
    </AppPage>
  );
}
