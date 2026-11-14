"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { COMPARE_KEY } from "../lib/choices";
import { useLocal } from "../lib/local-store";

/** Without ?ids=, load the compare tray from this device into the URL. */
export function CompareFromDevice() {
  const [ids, , hydrated] = useLocal<string[]>(COMPARE_KEY, []);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (hydrated && !sp.get("ids") && ids.length) {
      const p = new URLSearchParams(sp.toString());
      p.set("ids", ids.join(","));
      router.replace(`${pathname}?${p}`);
    }
  }, [hydrated, ids, sp, router, pathname]);
  return null;
}

export function RemoveFromCompare({ id, label }: { id: string; label: string }) {
  const [, setIds] = useLocal<string[]>(COMPARE_KEY, []);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button
      type="button"
      aria-label={`Remove ${label} from compare`}
      className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        setIds((x) => x.filter((i) => i !== id));
        const p = new URLSearchParams(sp.toString());
        const rest = (p.get("ids") ?? "").split(",").filter((i) => i && i !== id);
        if (rest.length) p.set("ids", rest.join(","));
        else p.delete("ids");
        router.replace(`${pathname}?${p}`);
      }}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
