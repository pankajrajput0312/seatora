// The preferences Ask Seatora can remember (memory.ts stores them; the page's panel edits them). Client-safe.

export const PREF_KEYS = ["course_priority", "budget", "bond_tolerance", "preferred_states", "avoided_states", "home_state", "college_types", "other"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export const prefLabel: Record<PrefKey, string> = {
  course_priority: "Course priority",
  budget: "Budget",
  bond_tolerance: "Bond tolerance",
  preferred_states: "Preferred states",
  avoided_states: "States to avoid",
  home_state: "Home state",
  college_types: "College types",
  other: "Other",
};
