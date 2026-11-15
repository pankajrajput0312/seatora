"use client";

import { Download, Share, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "seatora_install_dismissed"; // the time she closed it: asked again after two weeks

/**
 * On phones: registers the service worker and offers "Add Seatora to your home screen". Android/Chrome: one tap opens
 * the browser's install sheet. iPhone/iPad Safari (no install API): how to do it from the Share menu. Never shown in the
 * installed app, on desktop, or for two weeks after she closes it.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(max-width: 767px)").matches;
    const closed = Number(localStorage.getItem(KEY) ?? 0);
    if (standalone || !phone || navigator.webdriver || Date.now() - closed < 14 * 864e5) return; // webdriver: automated tests
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !/CriOS|FxiOS/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setShow(true);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;
  const close = () => {
    localStorage.setItem(KEY, String(Date.now()));
    setShow(false);
  };
  // Above the planner's bottom bar on /decide.
  const bottom = pathname.startsWith("/decide") ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]";
  return (
    <div role="dialog" aria-label="Install Seatora" className={`fixed inset-x-3 ${bottom} z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground shadow-lg md:hidden print:hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Add Seatora to your home screen</p>
        {ios && !event ? (
          <p className="text-xs text-muted-foreground">
            Tap <Share className="inline size-3.5 align-text-bottom" aria-label="Share" /> then &ldquo;Add to Home Screen&rdquo;.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Opens like an app, full screen.</p>
        )}
      </div>
      {event && (
        <button
          type="button"
          onClick={async () => {
            await event.prompt();
            await event.userChoice.catch(() => null);
            setEvent(null);
            setShow(false);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          <Download className="size-4" aria-hidden /> Install
        </button>
      )}
      <button type="button" onClick={close} aria-label="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
