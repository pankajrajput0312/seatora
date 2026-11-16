// Set at sign-in / sign-up (createSession); while it is there the planner opens the plan pop-up once for anyone without
// the Season Pass. Not httpOnly: the pop-up clears it when closed. Carries nothing but "1".
export const PLAN_PROMPT_COOKIE = "seatora_plan_prompt";
export const PLAN_PROMPT_MAX_AGE_S = 30 * 60;
/** The pop-up shows an account at most once in this long (decide/layout.tsx reads her last plan_popup_shown). */
export const PLAN_PROMPT_EVERY_MS = 3 * 86_400_000;
