// The chat stream's events (POST /api/ask/chat): one `data: <json>\n\n` frame each, ending with done or error.

export type ChatEvent =
  | { type: "meta"; conversationId: string; requestId: string }
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "status"; text: string }
  /** The text so far is withdrawn: a corrected answer follows. */
  | { type: "replace" }
  /** The saved turn follows in full (a replay): drop what is shown and use it. */
  | { type: "reset" }
  /** Keep-alive every ~10 s. */
  | { type: "ping" }
  | { type: "tool"; name: string; label: string }
  /** outcome checkpoint: post a continue for segment `next` now; running: another run has it, read the saved turn. */
  | { type: "done"; outcome: string; next?: number }
  | { type: "error"; outcome: string; message: string };

export const sseFrame = (e: ChatEvent) => `data: ${JSON.stringify(e)}\n\n`;

/** Complete frames in `buf` as events (malformed ones skipped) and the unfinished rest. */
export function parseSse(buf: string): { events: ChatEvent[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  const events = parts.flatMap((p) => {
    const data = p.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
    try {
      const e = JSON.parse(data);
      return e && typeof e.type === "string" ? [e as ChatEvent] : [];
    } catch {
      return [];
    }
  });
  return { events, rest };
}
