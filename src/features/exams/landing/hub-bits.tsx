// What NEET PG's public guides (/neet-pg/cutoff, /neet-pg/college-predictor…) share: their head (breadcrumb, h1,
// intro) and sections, in the cutoff pages' look. Server components, no JS.
import { Fragment } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/cn";
import { breadcrumbLd } from "@/lib/seo";

export const hubLink = "underline decoration-foreground/25 underline-offset-4 hover:text-sky";
const NEET_PG: [string, string] = ["NEET PG counselling", "/neet-pg"];

/** Home → NEET PG counselling → … → this page, as JSON-LD. */
export const hubCrumbs = (...trail: [string, string][]) => breadcrumbLd([[siteConfig.name, "/"], NEET_PG, ...trail]);

/** A guide's head: the breadcrumb under NEET PG counselling (`trail`: [name, path], this page last), its h1 and intro. */
export function HubHead({ trail, h1, children }: { trail: [string, string][]; h1: string; children?: React.ReactNode }) {
  const all = [NEET_PG, ...trail];
  return (
    <section aria-labelledby="hub-h" className="border-b border-border">
      <Container className="pt-8 pb-14 sm:pt-16 md:pb-20">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            {all.map(([name, path], i) => (
              <Fragment key={path}>
                {i > 0 && <li aria-hidden>/</li>}
                {i < all.length - 1 ? <li><Link href={path} className={hubLink}>{name}</Link></li> : <li aria-current="page">{name}</li>}
              </Fragment>
            ))}
          </ol>
        </nav>
        <h1 id="hub-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{h1}</h1>
        {children}
      </Container>
    </section>
  );
}

/** A section with its h2 (and an intro line under it). */
export function HubSection({ id, title, intro, className, children }: { id: string; title: string; intro?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-b border-border">
      <Container className={cn("py-14 md:py-20", className)}>
        <h2 id={id} className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        {intro && <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{intro}</p>}
        {children}
      </Container>
    </section>
  );
}

/** A paragraph under a guide's h1. */
export const Lead = ({ children }: { children: React.ReactNode }) => <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">{children}</p>;
