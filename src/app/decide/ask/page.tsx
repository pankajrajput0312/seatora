import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { askUser } from "@/features/ask/access";
import { AskChat, type Starter } from "@/features/ask/components/ask-chat";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { loadSynced } from "@/app/decide/sync-actions";
import { profileFromParams, profileSchema, profileToParams, toURLSearchParams, type Profile } from "@/features/decide/profile";
import { getMeta } from "@/features/decide/service";
import { activeExam } from "@/features/exams/active";
import { DEFAULT_EXAM, exams } from "@/features/exams/registry";

// Ask Seatora (owner only, ASK_ENABLED=1): anyone else gets the not-found view, and no link anywhere points here.
// Checked here too, so a non-owner's page carries no "Ask Seatora" title (metadata renders before the page).
export async function generateMetadata(): Promise<Metadata> {
  if (!(await askUser())) notFound();
  return { title: "Ask Seatora", robots: { index: false, follow: false } };
}

export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await askUser())) notFound();
  // Ask reads NEET PG's data only. Another exam active (staff): her NEET PG profile (the account's), said to be that.
  const exam = await activeExam();
  const other = exam !== DEFAULT_EXAM;
  const saved = other ? profileSchema.safeParse((await loadSynced(DEFAULT_EXAM).catch(() => null))?.profile?.value) : null;
  const profile: Profile | null = other ? (saved?.success ? saved.data : null) : profileFromParams(toURLSearchParams(await searchParams));
  const meta = await getMeta();
  const first = profile?.pairs?.[0]?.split("~") ?? (profile?.specialties[0] ? [profile.degrees[0] ?? "MD", profile.specialties[0]] : null);
  const course = first ? `${first[0]} ${meta.courses.find((c) => c.specialty === first[1])?.name ?? first[1]}` : "MD Anaesthesiology";
  const air = profile ? `AIR ${formatRank(profile.rank)}` : null;
  const youLine = profile ? `${other ? "Your NEET PG profile: " : ""}${air} · ${profile.category}${profile.pwd ? " PwD" : ""} · ${course}` : null;
  const starters: Starter[] = [
    { kind: "list", title: "Build my choice list", prompt: air ? `Build my full choice list for ${air} this round` : "Build my full choice list for this round" },
    { kind: "rank", title: "What can I get?", prompt: air ? `What can I get with ${air}, and what should I fill?` : "What can I get with my rank?" },
    { kind: "fee", title: "Is it worth the fee?", prompt: "Is Chettinad worth ₹33 L/yr for MD Anaesthesiology?" },
    { kind: "chances", title: "My chances", prompt: `What are my chances for ${course} at Seth GS Medical College?` },
    { kind: "compare", title: "Compare two colleges", prompt: "Compare Kokilaben and Seth GS for Anaesthesia" },
    { kind: "bond", title: "Bond risks", prompt: `Which ${course} seats carry the riskiest bonds, and what do they cost to leave?` },
  ];
  return (
    <AppPage className="grid grid-cols-1">
      {other && (
        <p role="note" className="mb-3 flex flex-wrap items-center gap-x-3 rounded-lg border border-sun/40 bg-sun/10 px-4 py-2 text-sm">
          <span className="font-semibold">Ask Seatora covers NEET PG only for now: not {exams[exam].label}.</span>
          {/* A full load (the layout is the exam's): ?exam= goes through app/decide/exam/route.ts (staff only). */}
          <a href={`/decide/ask?exam=${DEFAULT_EXAM}`} className="inline-flex min-h-11 items-center text-sky underline">Switch to NEET PG</a>
        </p>
      )}
      <AskChat
        starters={starters}
        youLine={youLine}
        profileParams={other ? (profile ? profileToParams(profile).toString() : "") : undefined}
        head={<PageHead title="Ask Seatora" about="An assistant over Seatora's MCC data: options for your rank, colleges, fees and bonds, this round's seats, residents and your choice list. It reads the same data as the pages; closing ranks are history, not a prediction." />}
      />
    </AppPage>
  );
}
