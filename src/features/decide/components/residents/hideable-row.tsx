type Hide = (id: string) => Promise<{ ok: true; data: null } | { ok: false; error: string }>;

/**
 * A Residents table row. The Hide control was taken out on the owner's request (15 Nov 2026): names are hidden on
 * request by email only. `id`, `name`, `hide` and `colSpan` stay so callers need no change.
 */
export function HideableRow({ className, children }: { id: string; name: string; hide: Hide; colSpan: number; className?: string; children: React.ReactNode }) {
  return <tr className={className}>{children}</tr>;
}
