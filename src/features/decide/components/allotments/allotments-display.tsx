"use client";

import { useMemo } from "react";
import { z } from "zod";
import { useLocal } from "../../lib/local-store";
import { DisplayMenu } from "../seats/seat-matrix";

const DISPLAY_KEY = "medpath.allotments.hidden";
const NONE: unknown = [];

/** Allotments' column chooser (the Seats matrix's): hides `#allotments [data-col]` cells by CSS, saved on the device. */
export function AllotmentsDisplay({ cols }: { cols: { key: string; label: string }[] }) {
  const [saved, save] = useLocal<unknown>(DISPLAY_KEY, NONE);
  const hidden = useMemo(() => {
    const r = z.array(z.string()).safeParse(saved);
    return new Set(r.success ? r.data.filter((k) => cols.some((c) => c.key === k)) : []);
  }, [saved, cols]);
  return (
    <>
      <DisplayMenu cols={cols} hidden={hidden} setHidden={save} />
      {/* Only known column keys reach the selector. */}
      <style>{[...hidden].map((k) => `#allotments [data-col="${k}"]{display:none}`).join("")}</style>
    </>
  );
}
