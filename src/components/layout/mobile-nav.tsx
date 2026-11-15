"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { AuthLink } from "./auth-link";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted md:hidden" aria-label="Open menu">
        <Menu className="size-5" strokeWidth={1.75} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 top-0 z-50 border-b border-border bg-popover p-5 shadow-overlay">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-pixel text-lg">{siteConfig.name}</Dialog.Title>
            <Dialog.Close className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Close menu">
              <X className="size-5" strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
          <nav aria-label="Mobile" className="mt-4 grid">
            {siteConfig.nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="border-b border-border py-3.5 text-base">
                {item.label}
              </Link>
            ))}
            <AuthLink onClick={() => setOpen(false)} className="border-b border-border py-3.5 text-base" />
          </nav>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link href="/pricing" onClick={() => setOpen(false)}>Get Seatora — Free</Link>
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
