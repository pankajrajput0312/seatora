import { notFound } from "next/navigation";

// An address under /decide that no page answers: the app's own not-found (decide/not-found.tsx) in the app shell,
// not the public site's 404.
export default function DecideMissing(): never {
  notFound();
}
