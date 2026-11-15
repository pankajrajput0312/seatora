import { notFound } from "next/navigation";

// Rank journey is off in production (owner, 15 Nov 2026): no nav entry, no links, and the page answers 404.
export default function RankJourneyOff(): never {
  notFound();
}
