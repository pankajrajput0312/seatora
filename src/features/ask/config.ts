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
  /** Whole answer (all tool rounds), ms. */
  timeoutMs: int(process.env.ASK_TIMEOUT_MS, 60_000),
});

/** Limits that are not worth an env var. */
export const ASK_MAX_ROUNDS = 8;
export const ASK_TOOL_TIMEOUT_MS = 5_000;
export const ASK_MAX_INPUT_CHARS = 2_000;
export const ASK_MAX_TURNS = 20;
