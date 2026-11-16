import { profileHasCourse, type ProfileCourses } from "../profile";
import type { Course } from "../types";

/**
 * A page's Course filter that defaults to her profile's courses (Residents' rule, for Rank scan, Fees and Last ranks):
 * `course` (repeated or comma-separated course slugs) absent → her courses; "all" → every course; slugs → those.
 * `slugs` null: no course filter (all, or no profile courses). `choices`: the shared searchable chips' options
 * (FilterDropdown), "All courses" first while she has courses of her own.
 */
export function courseFilter(params: URLSearchParams, profile: ProfileCourses | null, courses: Course[], name = "course") {
  const picked = params.getAll(name).flatMap((v) => v.split(",")).filter(Boolean);
  const mine = profile && (profile.pairs?.length || profile.specialties.length || profile.degrees.length) ? courses.filter((c) => profileHasCourse(profile, c)) : [];
  const all = picked.includes("all");
  const typed = all ? [] : picked.filter((s) => courses.some((c) => c.slug === s));
  const slugs = all ? null : typed.length ? typed : mine.length ? mine.map((c) => c.slug) : null;
  const choices = [...(mine.length ? [{ value: "all", label: "All courses" }] : []), ...courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))];
  const label = (slug: string) => choices.find((c) => c.value === slug)?.label ?? slug;
  return {
    slugs: slugs && new Set(slugs),
    mine,
    all,
    typed,
    choices,
    /** For FilterDropdown: what is ticked, and the header with none ticked ("Your courses (2)"). */
    selected: all ? ["all"] : typed,
    none: mine.length ? `Your courses (${mine.length})` : "All courses",
    /** Active-filter chips: each typed course, "All courses", or her courses (× lifts to all). */
    chips: (href: (v: string | null) => string, without: (slug: string) => string) =>
      all
        ? [{ label: "All courses", param: name, href: href(null) }]
        : typed.length
          ? typed.map((s) => ({ label: label(s), param: name, href: without(s) }))
          : mine.length
            ? [{ label: `Your courses (${mine.length})`, param: name, href: href("all") }]
            : [],
  };
}
