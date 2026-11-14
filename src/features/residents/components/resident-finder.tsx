"use client";

import { useMemo, useState } from "react";
import { AtSign, Hospital, Mail, MapPin, MessageCircle, Phone, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { RankFit } from "@/features/rank-predictor/lib/rank-fit";
import { fitLabel, groupByCollege, type ResidentMatch } from "../lib/match";
import type { Contact, Resident } from "../schema";

const MIN = 1;
const MAX = 300000;
const fitTone: Record<RankFit, "success" | "warning" | "error"> = { inside: "success", near: "warning", beyond: "error" };

const digits = (n: string) => n.replace(/\D/g, "");

function contactLinks(c: Contact, name: string) {
  return [
    c.whatsapp && { href: `https://wa.me/${digits(c.whatsapp)}`, label: "WhatsApp", icon: MessageCircle },
    c.phone && { href: `tel:${c.phone}`, label: "Call", icon: Phone },
    c.email && { href: `mailto:${c.email}`, label: "Email", icon: Mail },
    c.instagram && { href: `https://instagram.com/${c.instagram}`, label: "Instagram", icon: AtSign },
    c.linkedin && { href: c.linkedin, label: "LinkedIn", icon: AtSign },
  ]
    .filter((l): l is { href: string; label: string; icon: typeof Phone } => !!l)
    .map((l) => ({ ...l, aria: `${l.label} ${name}` }));
}

function ResidentRow({ r }: { r: ResidentMatch }) {
  const links = contactLinks(r.contact, r.name);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-medium">
          {r.name}
          {r.verified && <Badge tone="success" className="ml-2 align-middle">Verified</Badge>}
        </p>
        <p className="numeric font-mono text-xs text-muted-foreground">
          AIR <span className="text-foreground">{formatRank(r.rank)}</span> · {r.category} · {r.quota}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.course} · joined {r.year}{r.round ? `, ${r.round}` : ""}
      </p>
      {(links.length > 0 || r.fit) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {links.map(({ href, label, icon: Icon, aria }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label={aria}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
              {label}
            </a>
          ))}
          {r.fit && <Badge tone={fitTone[r.fit]} className="ml-auto">{fitLabel[r.fit]}</Badge>}
        </div>
      )}
    </li>
  );
}

export function ResidentFinder({ residents }: { residents: Resident[] }) {
  const [rank, setRank] = useState<number | null>(null);
  // Typed text stays raw until it's a valid rank, so partial input like "5" isn't snapped.
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupByCollege(residents, { rank, query }), [residents, rank, query]);
  const shown = groups.reduce((n, g) => n + g.residents.length, 0);
  const reset = () => {
    setRank(null);
    setDraft("");
    setQuery("");
  };

  return (
    <div>
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Find a hospital or resident</span>
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="College, city, state, course or name" className="h-11 pl-9" />
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your rank (optional)</span>
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="e.g. 12,450"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(digits(e.target.value));
              setRank(n >= MIN && n <= MAX ? n : null);
            }}
            onBlur={() => rank && setDraft(formatRank(rank))}
            className="numeric h-11 w-full rounded-md border border-input bg-background px-3 font-pixel text-2xl placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground focus:border-sky md:w-44"
          />
        </label>
      </div>

      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {residents.length === 0
          ? ""
          : `${shown} ${shown === 1 ? "resident" : "residents"} at ${groups.length} ${groups.length === 1 ? "college" : "colleges"}${rank ? `, closest to rank ${formatRank(rank)} first` : ""}.`}
      </p>

      {residents.length === 0 ? (
        <div className="mt-2 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-5 py-16 text-center">
          <Users className="size-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <p className="text-base font-medium">No residents added yet.</p>
          <p className="max-w-sm text-sm text-muted-foreground">Residents will appear here under their hospital, with ways to contact them.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-2 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-5 py-16 text-center">
          <p className="text-base font-medium">No hospitals or residents match.</p>
          <Button variant="secondary" size="sm" onClick={reset}>Clear search</Button>
        </div>
      ) : (
        <ul className="mt-2 grid gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <li key={`${g.college}|${g.state ?? ""}`} className="rounded-xl border border-border bg-card">
              <div className="flex items-start gap-3 border-b border-border p-5">
                <Hospital className="mt-0.5 size-5 shrink-0 text-sky" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0">
                  <h3 className="text-base font-medium leading-snug">{g.college}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {g.state && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden />
                        {g.state}
                      </span>
                    )}
                    <span>
                      {g.residents.length} {g.residents.length === 1 ? "resident" : "residents"}
                    </span>
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-border p-5">
                {g.residents.map((r) => <ResidentRow key={`${r.name}-${r.rank}-${r.year}`} r={r} />)}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Residents are listed, with their contact details, only with their agreement. Please be respectful when you reach out.
        Their ranks show where people got in before; they don&apos;t predict or guarantee your seat.
      </p>
    </div>
  );
}
