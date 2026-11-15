"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** "Sign in" or "Account" (opens the planner dashboard), decided client-side so the header (and landing page) stay static. */
export function AuthLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();
  // Re-check on every navigation: sign-in/out redirects don't remount the header.
  useEffect(() => setSignedIn(document.cookie.split("; ").includes("medpath_signed_in=1")), [pathname]);
  return (
    <Link href={signedIn ? "/decide" : "/login"} className={className} onClick={onClick}>
      {signedIn ? "Account" : "Sign in"}
    </Link>
  );
}
