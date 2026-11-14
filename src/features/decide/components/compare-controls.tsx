"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Until the server re-render lands, useSearchParams still holds the removed id. A second quick removal starts from the
// query already requested, or it would bring the first column back.
let inFlight: { from: string; to: string } | null = null;

/**
 * Removes one column (tray and URL). Focus goes to the next remaining column's header, or to the page heading when
 * none is left: both stay in the page across the re-render, so focus never falls to <body>.
 */
export function RemoveFromCompare({ id, label, nextFocus }: { id: string; label: string; nextFocus: string | null }) {
  const [, setIds] = useCompare();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (inFlight && inFlight.from !== sp.toString()) inFlight = null; // the requested URL landed
  }, [sp]);
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={`Remove ${label} from compare`}
      className="shrink-0"
      onClick={() => {
        setIds((x) => x.filter((i) => i !== id));
        const current = sp.toString();
        const p = new URLSearchParams(inFlight?.from === current ? inFlight.to : current);
        const rest = [...new Set(p.getAll("ids").flatMap((v) => v.split(",")).filter((i) => i && i !== id))];
        p.delete("ids");
        if (rest.length) p.set("ids", rest.join(","));
        inFlight = { from: current, to: p.toString() };
        router.replace(`${pathname}?${p}`, { scroll: false });
        const next = [nextFocus, ...rest].filter((i) => i && rest.includes(i)).map((i) => document.getElementById(`col-${i}`)).find(Boolean);
        (next ?? document.getElementById("main-h1"))?.focus();
      }}
    >
      <X className="size-4" aria-hidden />
    </Button>
  );
}
