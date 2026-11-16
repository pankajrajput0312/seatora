"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { signOut } from "../actions";

/** Fired when a sign-out finishes, so the public header re-reads the signed-in flag (signing out on "/" lands on "/": no new path). */
export const AUTH_EVENT = "seatora-auth";

/** Log out as a form (works before hydration), reading "Logging out…" while it runs. `label`: the words' own class. */
export function LogOutButton({ className, label, icon }: { className?: string; label?: string; icon?: React.ReactNode }) {
  return (
    <form action={signOut} className="shrink-0">
      <Submit className={className} label={label} icon={icon} />
    </form>
  );
}

function Submit({ className, label, icon }: { className?: string; label?: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) window.dispatchEvent(new Event(AUTH_EVENT));
    was.current = pending;
  }, [pending]);
  return (
    <button type="submit" aria-disabled={pending || undefined} className={className} onClick={(e) => pending && e.preventDefault()}>
      {icon}
      <span className={label}>{pending ? "Logging out…" : "Log out"}</span>
    </button>
  );
}
