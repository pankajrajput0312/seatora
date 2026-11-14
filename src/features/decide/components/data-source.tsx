import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { getMeta } from "../service";
import { rounds, roundLabel, type Term } from "../types";
import { Provisional } from "./bits";

type Used = { year: number; round?: string };

/**
 * Provenance for a data block, built from the data: the MCC allotment-result PDFs it draws on, each linked and marked
 * Provisional while MCC's result is (Source.provisional), and/or the documents its fee, stipend, bond and penalty
 * texts come from. `used`: the years (all rounds) or year+round pairs shown; omit for every result PDF.
 * `results={false}` for blocks with no allotment numbers (fees only).
 */
export async function DataSource({ used, terms, results = true }: { used?: Used[]; terms?: (Term["source"] | null | undefined)[]; results?: boolean }) {
  const meta = await getMeta();
  const keys = used && new Set(used.map((u) => `${u.year}|${u.round ?? "*"}`));
  const pdfs = results ? meta.sources.filter((s) => !keys || keys.has(`${s.year}|${s.round}`) || keys.has(`${s.year}|*`)) : [];
  const years = [...new Set(pdfs.map((s) => s.year))].sort((a, b) => a - b);
  const docs = new Map<string, { type: Term["source"]["type"]; urls: Set<string> }>();
  for (const t of terms ?? []) {
    if (!t) continue;
    const d = docs.get(t.name) ?? docs.set(t.name, { type: t.type, urls: new Set() }).get(t.name)!;
    if (t.url) d.urls.add(t.url);
  }
  if (!pdfs.length && !docs.size) return null;
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {pdfs.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone={sourceTypeLabels.OFFICIAL.tone}>{sourceTypeLabels.OFFICIAL.text}</Badge>
          <span>Allotment results</span>
          {years.map((y) => (
            <span key={y} className="inline-flex flex-wrap items-center gap-x-2">
              <span className="numeric">{y}:</span>
              {pdfs
                .filter((s) => s.year === y)
                .sort((a, b) => rounds.indexOf(a.round) - rounds.indexOf(b.round))
                .map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.name} className="inline-flex min-h-6 items-center underline hover:text-sky">
                        <span className="sr-only">{s.name}: </span>{roundLabel[s.round]}<span className="sr-only">, PDF (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span title={s.name}>{roundLabel[s.round]}</span>
                    )}
                    <Provisional when={s.provisional} />
                  </span>
                ))}
            </span>
          ))}
        </p>
      )}
      {[...docs].map(([name, d]) => {
        const tier = sourceTypeLabels[d.type];
        const [only] = d.urls;
        return (
          <p key={name} className="flex flex-wrap items-center gap-x-2">
            <Badge tone={tier.tone}>{tier.text}</Badge>
            {d.urls.size === 1 ? (
              <a href={only} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center underline hover:text-sky">{name}<span className="sr-only"> (opens in a new tab)</span></a>
            ) : (
              <span>{name}{d.urls.size > 1 && `: ${d.urls.size} documents, each value links its own`}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}
