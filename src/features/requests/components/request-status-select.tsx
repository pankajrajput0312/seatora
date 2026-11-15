"use client";

import { useState, useTransition } from "react";
import { setRequestStatus } from "../actions";
import { REQUEST_STATUSES } from "../validations";
import { statusLabel } from "./request-bits";

type Status = (typeof REQUEST_STATUSES)[number];

/** Owner's status select for one request: saves on change, says so, and goes back to the saved value if it fails. */
export function RequestStatusSelect({ id, status, label }: { id: string; status: Status; label: string }) {
  const [saved, setSaved] = useState(status);
  const [value, setValue] = useState(status);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: Status) => {
    setValue(next);
    startTransition(async () => {
      setNote(null);
      const res = await setRequestStatus(id, next).catch(() => ({ ok: false as const, error: "We couldn't update the request. Please try again." }));
      if (res.ok) {
        setSaved(next);
        setNote({ ok: true, text: "Saved" });
      } else {
        setValue(saved);
        setNote({ ok: false, text: res.error });
      }
    });
  };

  return (
    <div className="grid w-full gap-1 sm:w-48">
      <label className="grid gap-1.5 text-sm">
        <span className="text-xs font-semibold text-muted-foreground">Status<span className="sr-only">: {label}</span></span>
        <select value={value} onChange={(e) => change(e.target.value as Status)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:border-sky">
          {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
      </label>
      <p role="status" className={note && !note.ok ? "text-xs text-ember" : "text-xs text-muted-foreground"}>{pending ? "Saving…" : note?.text}</p>
    </div>
  );
}
