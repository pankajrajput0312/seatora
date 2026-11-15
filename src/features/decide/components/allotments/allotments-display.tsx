"use client";

import { DisplayMenu, useHiddenCols } from "../seats/seat-matrix";

const DISPLAY_KEY = "medpath.allotments.hidden";
/** Hidden until she picks them in Display: each rank's Journey shows both. */
const DEFAULT_HIDDEN = ["cand", "option"];

/** Allotments' column chooser (the Seats matrix's): hides `#allotments [data-col]` cells by CSS, saved on the device. */
export function AllotmentsDisplay({ cols }: { cols: { key: string; label: string }[] }) {
  const [hidden, save] = useHiddenCols(DISPLAY_KEY, cols, DEFAULT_HIDDEN);
  return (
    <>
      <DisplayMenu cols={cols} hidden={hidden} setHidden={save} always="Rank, round and institute always show." />
      {/* Only known column keys reach the selector. */}
      <style>{[...hidden].map((k) => `#allotments [data-col="${k}"]{display:none}`).join("")}</style>
    </>
  );
}
