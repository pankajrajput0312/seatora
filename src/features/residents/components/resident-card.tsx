import Image from "next/image";
import { AtSign, Mail, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PixelDoctor } from "@/components/marketing/pixel-doctor";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { RankFit } from "@/features/rank-predictor/lib/rank-fit";
import { fitLabel, type ResidentMatch } from "../lib/match";
import type { Contact } from "../schema";

export const tints = [
  { bg: "bg-ember", text: "text-ember" },
  { bg: "bg-sky", text: "text-sky" },
  { bg: "bg-sun", text: "text-sun" },
  { bg: "bg-leaf", text: "text-leaf" },
] as const;

const fitTone: Record<RankFit, "success" | "warning" | "error"> = { inside: "success", near: "warning", beyond: "error" };

function contactLinks(c: Contact) {
  return [
    c.whatsapp && { href: `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`, label: "WhatsApp", icon: MessageCircle },
    c.phone && { href: `tel:${c.phone}`, label: "Call", icon: Phone },
    c.email && { href: `mailto:${c.email}`, label: "Email", icon: Mail },
    c.instagram && { href: `https://instagram.com/${c.instagram}`, label: "Instagram", icon: AtSign },
    c.linkedin && { href: c.linkedin, label: "LinkedIn", icon: AtSign },
  ].filter((l): l is { href: string; label: string; icon: typeof Phone } => !!l);
}

/** Duotone portrait: the image (or a pixel doctor) sits under a multiply tint that fades to mist on hover. */
export function Portrait({ seed, photo, tint, children }: { seed: string; photo?: string; tint: (typeof tints)[number]; children?: React.ReactNode }) {
  return (
    <div className="relative isolate aspect-[3/4] overflow-hidden rounded-lg bg-black">
      {photo ? (
        <div className="dither absolute inset-0">
          <Image src={photo} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover object-top transition-transform duration-700 group-hover/portrait:scale-[1.04]" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-white/35">
          <PixelDoctor seed={seed} className="absolute inset-0 size-full origin-bottom transition-transform duration-700 group-hover/portrait:scale-[1.04]" />
        </div>
      )}
      <div className={cn("pointer-events-none absolute inset-0 mix-blend-multiply transition-opacity duration-500 group-hover/portrait:opacity-0 group-focus-within/portrait:opacity-0", tint.bg)} />
      <div className="pointer-events-none absolute inset-0 bg-mist opacity-0 mix-blend-multiply transition-opacity duration-500 group-hover/portrait:opacity-100 group-focus-within/portrait:opacity-100" />
      <div className="dots pointer-events-none absolute inset-0 opacity-60 mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-50% to-black/75" />
      {children}
    </div>
  );
}

export function ResidentCard({ r, index }: { r: ResidentMatch; index: number }) {
  const tint = tints[index % tints.length];
  const links = contactLinks(r.contact);
  return (
    <li className="group/portrait rise-in" style={{ "--i": index % 4 } as React.CSSProperties}>
      <Portrait seed={r.name} photo={r.photo} tint={tint}>
        <span className="numeric absolute top-3 left-3 rounded-sm bg-black/60 px-2 py-1 font-pixel text-sm text-white">
          AIR {formatRank(r.rank)}
        </span>
        {r.verified && <Badge tone="success" className="absolute top-3 right-3 bg-black/60">Verified</Badge>}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-base font-medium text-white">{r.name}</p>
          <p className="mt-0.5 text-xs text-white/75">{r.category} · {r.quota} · {r.year}{r.round ? ` ${r.round}` : ""}</p>
        </div>
      </Portrait>
      <p className={cn("mt-3 font-pixel text-lg leading-tight", tint.text)}>{r.course}</p>
      {r.fit && <Badge tone={fitTone[r.fit]} className="mt-2">{fitLabel[r.fit]}</Badge>}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {links.map(({ href, label, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label={`${label} ${r.name}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 text-xs font-medium transition-colors hover:bg-raised"
            >
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
              {label}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

/** Shown while no residents are listed: what each card will hold. Illustrative avatars, no people. */
export function PortraitPreview() {
  const labels = ["their rank", "their hospital", "their specialty", "their year"];
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="What each resident card shows">
      {labels.map((label, i) => (
        <li key={label} className="group/portrait rise-in" style={{ "--i": i } as React.CSSProperties}>
          <Portrait seed={label} tint={tints[i]}>
            {/* Among Us-style name label: white pixel text with a black outline, floating above the head. */}
            <span className="absolute inset-x-0 top-[5%] z-10 text-center font-pixel text-lg leading-none text-white [text-shadow:2px_0_0_var(--color-black),-2px_0_0_var(--color-black),0_2px_0_var(--color-black),0_-2px_0_var(--color-black),2px_2px_0_var(--color-black),-2px_-2px_0_var(--color-black),2px_-2px_0_var(--color-black),-2px_2px_0_var(--color-black)] sm:text-xl md:text-2xl">
              {label}
            </span>
          </Portrait>
        </li>
      ))}
    </ul>
  );
}
