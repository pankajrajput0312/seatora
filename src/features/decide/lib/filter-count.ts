// The Filters sheet's "Show N results" after a change (filter-form.tsx FiltersPanel): the count for the fields as they
// are now, before she applies them. Three sources: a tally the page sent (`counts`, a list loaded whole), a server
// action (`recount`), or the page itself with those params, read up to its toolbar's count (ToolbarCount's attribute).

/** The page's result count in its HTML: ToolbarCount's `data-filter-total`. */
export const FILTER_TOTAL = "data-filter-total";
const totalRe = new RegExp(`${FILTER_TOTAL}="(\\d+)"`);

/** The count in a page's HTML (the first ToolbarCount's), or null. */
export function totalIn(html: string) {
  const m = html.match(totalRe);
  return m ? Number(m[1]) : null;
}

/**
 * One group of rows the page has whole (`n` rows, `values`: each filter's value for them), e.g. an institute's residents
 * by course and year: the rows a query keeps are the groups whose every value is ticked, or whose filter has none ticked.
 */
export type Tally = { values: Record<string, string>; n: number }[];
export const tally = (counts: Tally, q: URLSearchParams) =>
  counts.reduce((s, c) => s + (Object.entries(c.values).every(([k, v]) => !q.getAll(k).length || q.getAll(k).includes(v)) ? c.n : 0), 0);

/** The fields as the form would submit them (GET: repeated values kept). */
export const formQuery = (form: HTMLFormElement) => new URLSearchParams([...new FormData(form)].map(([k, v]) => [k, String(v)]));

/** The page at `url` (the form's action with its params), read only until its count shows up. Null without one. */
export async function countFromPage(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) return null;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return totalIn(text);
    // Only the tail can hold an attribute cut across two chunks.
    text = text.slice(-64) + value;
    const n = totalIn(text);
    if (n != null) {
      reader.cancel().catch(() => {});
      return n;
    }
  }
}
