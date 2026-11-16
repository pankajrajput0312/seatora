import type Anthropic from "@anthropic-ai/sdk";
import type { AskClient } from "../client";

// Recorded model calls for the evals: record once against the real model (ASK_EVAL_RECORD=1), then replay them with no
// Bedrock call (npm run ask:eval:replay). Tools still run on the real database, so a replay checks the plumbing, the
// tools' data and the grader for that recorded answer.

export type RecordedCall = { texts: string[]; thinking: string[]; message: Anthropic.Message };
type Stream = { on: (ev: string, cb: (t: string) => void) => Stream; finalMessage: () => Promise<Anthropic.Message> };

export function recordingClient(inner: AskClient, calls: RecordedCall[]): AskClient {
  const stream = (params: Anthropic.MessageStreamParams, opts?: { signal?: AbortSignal }) => {
    const s = inner.messages.stream(params, opts);
    const call: RecordedCall = { texts: [], thinking: [], message: null as unknown as Anthropic.Message };
    s.on("text", (t) => call.texts.push(t));
    s.on("thinking", (t) => call.thinking.push(t));
    const out: Stream = {
      on: (ev, cb) => (s.on(ev as "text", cb), out),
      finalMessage: async () => {
        call.message = await s.finalMessage();
        calls.push(call);
        return call.message;
      },
    };
    return out;
  };
  return { messages: { stream } } as unknown as AskClient;
}

export function replayClient(calls: RecordedCall[]): AskClient {
  let i = 0;
  const stream = () => {
    const call = calls[i++];
    const on: Record<string, (t: string) => void> = {};
    const out: Stream = {
      on: (ev, cb) => ((on[ev] = cb), out),
      finalMessage: async () => {
        if (!call) throw new Error("replay: no more recorded calls (the run diverged from the recording)");
        call.thinking.forEach((t) => on.thinking?.(t));
        call.texts.forEach((t) => on.text?.(t));
        return call.message;
      },
    };
    return out;
  };
  return { messages: { stream } } as unknown as AskClient;
}
