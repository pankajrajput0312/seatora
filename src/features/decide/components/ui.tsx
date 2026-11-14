import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { profileParamKeys } from "../profile";

// Shared building blocks so every Decide screen reads the same way.

export const tbl = {
  wrap: "relative overflow-x-auto rounded-xl border border-border bg-card",
  table: "w-full text-sm",
  headRow: "border-b border-border text-left",
  th: "px-4 py-3 text-xs font-semibold text-muted-foreground",
  row: "border-b border-border last:border-0 hover:bg-muted/50",
  td: "px-4 py-3 align-top",
  num: "px-4 py-3 text-right align-top text-[15px] font-semibold tabular-nums",
};

/** GET filter form that keeps the profile params. */
export function FilterBar({ action, params, children, cols = "md:grid-cols-4" }: { action: string; params: URLSearchParams; children: React.ReactNode; cols?: string }) {
  return (
    <Form key={params.toString()} action={action} role="search" className={cn("grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2", cols, "md:items-end")}>
      {profileParamKeys.map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
      {children}
      <Button type="submit" className="h-11">Apply</Button>
    </Form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const control = "h-11 w-full rounded-md border border-input bg-card px-3 text-sm";

export function Select({ name, value, options, all }: { name: string; value: string | undefined; options: { value: string; label: string }[]; all?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={control}>
      {all && <option value="">{all}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Empty({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {href && <Link href={href} className="text-sm text-sky underline">{action ?? "Clear filters"}</Link>}
    </div>
  );
}

/** Builds hrefs that keep current params and apply changes. */
export function hrefWith(path: string, params: URLSearchParams) {
  return (changes: Record<string, string | null>, hash = "") => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return `${path}${qs ? `?${qs}` : ""}${hash}`;
  };
}

/** Clean URL for "Clear filters": profile params only. */
export function profileOnly(path: string, params: URLSearchParams) {
  const p = new URLSearchParams();
  for (const k of profileParamKeys) if (params.get(k)) p.set(k, params.get(k)!);
  const qs = p.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}
