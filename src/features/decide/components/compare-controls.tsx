"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useCompare } from "../lib/use-decide-store";

/** Without ?ids=, load the compare tray from this device into the URL; drop ids that no longer exist. */
export function CompareFromDevice({ validIds, requested }: { validIds: string[]; requested: string[] }) {
  const [ids, setIds] = useCompare();
  useEffect(() => {
    const unknown = requested.filter((id) => !validIds.includes(id));
    if (unknown.length) setIds((x) => x.filter((id) => !unknown.includes(id)));
  }, [requested, validIds, setIds]);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!sp.get("ids") && ids.length) {
      const p = new URLSearchParams(sp.toString());
      p.set("ids", ids.join(","));
      router.replace(`${pathname}?${p}`);
    }
  }, [ids, sp, router, pathname]);
  return null;
}

export function RemoveFromCompare({ id, label, nextFocus }: { id: string; label: string; nextFocus: string | null }) {
  const [, setIds] = useCompare();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button
      type="button"
      aria-label={`Remove ${label} from compare`}
      className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        setIds((x) => x.filter((i) => i !== id));
        const p = new URLSearchParams(sp.toString());
        const rest = (p.get("ids") ?? "").split(",").filter((i) => i && i !== id);
        if (rest.length) p.set("ids", rest.join(","));
        else p.delete("ids");
        router.replace(`${pathname}?${p}`, { scroll: false });
        setTimeout(() => (document.getElementById(nextFocus ? `col-${nextFocus}` : "main-h1") ?? document.querySelector("h1"))?.focus(), 300);
      }}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
