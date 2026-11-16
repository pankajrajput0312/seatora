"use client";

import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Her link with Copy, WhatsApp and (where the browser has it) the native share sheet. */
export function ShareLink({ url, message }: { url: string; message: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const text = `${message} ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="ref-link" className="text-sm font-semibold">Your link</label>
      <input id="ref-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="numeric h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy link"}
        </Button>
        <Button asChild variant="secondary">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={() => navigator.share({ title: "Seatora", text: message, url }).catch(() => {})}>
            <Share2 className="size-4" aria-hidden /> Share
          </Button>
        )}
      </div>
      <p role="status" className="sr-only">{copied ? "Link copied" : ""}</p>
    </div>
  );
}
