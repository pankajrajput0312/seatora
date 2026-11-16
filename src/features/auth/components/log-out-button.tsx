"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * The landing page after Log out ("/?out=1", signOut): back to its top, "Logged out" for a few seconds, and the ?out=1 off
 * the address. Also when she logs out from the landing page itself (no new page: AUTH_EVENT).
 */
export function LoggedOut() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const check = () => {
      if (new URLSearchParams(location.search).get("out") !== "1") return;
      history.replaceState(history.state, "", location.pathname + location.hash);
      window.scrollTo(0, 0);
      setShow(true);
      clearTimeout(t);
      t = setTimeout(() => setShow(false), 3000);
    };
    check();
    window.addEventListener(AUTH_EVENT, check);
    return () => {
      window.removeEventListener(AUTH_EVENT, check);
      clearTimeout(t);
    };
  }, []);
  return (
    <p role="status" className={show ? "pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg" : "sr-only"}>
      {show ? "Logged out" : ""}
    </p>
  );
}
