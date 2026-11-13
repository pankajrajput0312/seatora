"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Chat-style bubble that cycles through messages with a short fade, like roook.space's hero. */
export function CyclingBubble({ messages, className, interval = 2800 }: { messages: string[]; className?: string; interval?: number }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fade: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setVisible(false);
      fade = setTimeout(() => {
        setI((n) => (n + 1) % messages.length);
        setVisible(true);
      }, 250);
    }, interval);
    return () => {
      clearInterval(id);
      clearTimeout(fade);
    };
  }, [messages.length, interval]);

  return (
    <p className={cn("transition-all duration-250", visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0", className)}>
      {messages[i]}
    </p>
  );
}
