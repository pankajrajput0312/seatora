"use client";

import { useRef } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { AuthLink } from "./auth-link";

// Native <dialog>: showModal() gives the focus trap, Escape and top layer, so phones don't download a dialog library.
export function MobileNav() {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => {
    ref.current?.showModal();
    document.documentElement.style.overflow = "hidden";
  };
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" onClick={open} className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted md:hidden" aria-label="Open menu" aria-haspopup="dialog">
        <Menu className="size-5" strokeWidth={1.75} />
      </button>
      <dialog
        ref={ref}
        aria-label="Site navigation"
        onClose={() => (document.documentElement.style.overflow = "")}
        onClick={(e) => e.target === e.currentTarget && close()} // a tap on the backdrop
        className="m-0 w-full max-w-none border-b border-border bg-popover p-0 text-foreground shadow-overlay backdrop:bg-black/60 md:hidden"
      >
        <div className="p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <p className="font-pixel text-lg">{siteConfig.name}</p>
            <button type="button" onClick={close} className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Close menu">
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-4 grid">
            {siteConfig.nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={close} className="border-b border-border py-3.5 text-base">
                {item.label}
              </Link>
            ))}
            <AuthLink onClick={close} className="border-b border-border py-3.5 text-base" />
          </nav>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link href="/signup" onClick={close}>Get Seatora — Free</Link>
          </Button>
        </div>
      </dialog>
    </>
  );
}
