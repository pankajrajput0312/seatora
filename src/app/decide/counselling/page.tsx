import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/features/decide/components/bits";
import { MccLink } from "@/features/decide/components/pages/mcc-link";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { EmptyState, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams } from "@/features/decide/lib/params";
import { toURLSearchParams } from "@/features/decide/profile";
import { getNotices } from "@/features/decide/service";

export const metadata: Metadata = { title: "Counselling" };
const tabs = [
  { key: "schedule", label: "Schedule", kind: "schedule" },
  { key: "announcements", label: "Announcements", kind: "announcement" },
  { key: "merit", label: "Merit lists", kind: "merit" },
] as const;
const schema = z.object({ tab: z.enum(["schedule", "announcements", "merit"]).default("schedule") });

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function CounsellingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const tab = tabs.find((t) => t.key === parseSearchParams(schema, params).tab)!;
  // Only notices imported from MCC with their official link; none are loaded yet, and none are ever made up.
  const notices = (await getNotices()).filter((n) => n.kind === tab.kind);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Counselling">MCC All India PG counselling: schedule, announcements and merit lists. Always confirm dates on the official MCC site.</PageHead>
      <SubTabs label="Counselling" current={tab.key} items={tabs.map((t) => ({ key: t.key, label: t.label, href: L.to("/decide/counselling", { tab: t.key }) }))} />

      {notices.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={tab.key === "announcements" ? "No announcements loaded" : `No ${tab.label.toLowerCase()} loaded`}
          description="Decide has no feed of MCC notices yet, and it never shows made-up dates. The official MCC PG counselling site has the current schedule, announcements and results."
        >
          <MccLink />
        </EmptyState>
      ) : (
        <ol className="grid gap-2">
          {notices.map((n) => (
            <li key={n.url + n.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-xs text-muted-foreground"><time dateTime={n.date} className="numeric">{fmt(n.date)}</time> · {n.authority}</p>
                <p className="mt-1">{n.title} {n.status === "open" && <Badge tone="info" className="ml-1 align-middle">Open now</Badge>}</p>
              </div>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sm text-sky`}>
                Official notice<span className="sr-only"> on the {n.authority} site (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </AppPage>
  );
}
