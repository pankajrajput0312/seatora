// Ask Seatora settings, all from env (docs/ASK_SEATORA.md). Owner-only regardless of these.

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const askConfig = () => ({
  /** Off unless ASK_ENABLED=1: the page and API are 404 even for the owner. */
  enabled: process.env.ASK_ENABLED === "1",
  /** Bedrock model id (Mantle). */
  model: process.env.ASK_MODEL?.trim() || "anthropic.claude-opus-5-5",
  /** Output tokens per model call (thinking included). */
  maxOutputTokens: int(process.env.ASK_MAX_OUTPUT_TOKENS, 8000),
  /** Rough token budget for the conversation history sent each turn (older turns are dropped first). */
  historyTokens: int(process.env.ASK_HISTORY_TOKENS, 12000),
  /** Per owner account: requests per rolling hour, and tokens (input + output + cache writes) per UTC day. */
  hourlyRequests: int(process.env.ASK_HOURLY_REQUESTS, 60),
  dailyTokens: int(process.env.ASK_DAILY_TOKENS, 1_500_000),
  /**
   * Time, ms. `softMs` (deep: `deepSoftMs`) after a question no new lookups start. One run of the function stops at
   * `sliceMs` (under the route's maxDuration) and saves a checkpoint; the browser starts the next run at once. A turn
   * ends only when nothing moves for `stallMs` or at the total cap `capMs`, keeping the answer so far.
   */
  softMs: int(process.env.ASK_SOFT_MS, 30_000),
  deepSoftMs: int(process.env.ASK_DEEP_SOFT_MS, 90_000),
  sliceMs: int(process.env.ASK_SLICE_MS, 270_000),
  stallMs: int(process.env.ASK_STALL_MS, 60_000),
  capMs: int(process.env.ASK_CAP_MS, 600_000),
});

/** Limits that are not worth an env var. */
export const ASK_MAX_ROUNDS = 12;
export const ASK_TOOL_TIMEOUT_MS = 5_000;
export const ASK_MAX_INPUT_CHARS = 2_000;
export const ASK_MAX_TURNS = 20;
