"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Brain, Check, Copy, History, MessageSquarePlus, Play, RotateCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { keepProfileParams } from "@/features/decide/profile";
import { Markdown } from "./markdown";
import { ChatsPanel, MemoryPanel } from "./ask-panels";
import { parseSse, type ChatEvent } from "../sse";

// Ask Seatora's chat. The conversation lives on the server (saved per account, 30 days); this tab remembers which chat
// is open. A turn streams in; when a run reaches its time slice the server says "continue" and the next run starts at
// once; if the connection drops, the saved turn is read until it finishes (and continued if it waits at a checkpoint).
// Nothing she sees turns into an error while the answer is still moving.

type Status = "streaming" | "checkpoint" | "done" | "partial" | "error" | "stopped";
type Msg = { requestId: string; role: "user" | "assistant"; content: string; thinking?: string | null; status?: Status; phase?: string | null; segment?: number };
const CONV_KEY = "seatora.ask.conversation";
const DEEP_KEY = "seatora.ask.deep";
const MAX_INPUT = 2000;
const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Table rows written so far, for "Writing your list… 14 lines". */
const rowsIn = (s: string) => s.match(/^\|\s*\d+\s*\|/gm)?.length ?? 0;

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex min-h-8 items-center gap-1 text-sky" onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true))}>
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function AskChat({ starters }: { starters: string[] }) {
  const sp = useSearchParams();
  const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [deep, setDeep] = useState(false);
  const [panel, setPanel] = useState<"chats" | "memory" | null>(null);
  const [memVersion, setMemVersion] = useState(0);
  const live = useRef<{ requestId: string; ctrl: AbortController } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const convRef = useRef<string | null>(null);
  convRef.current = conv;
  const profile = () => keepProfileParams(new URLSearchParams(sp.toString())).toString();
  const busy = msgs.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "checkpoint"));

  const patch = useCallback((requestId: string, fn: (m: Msg) => Msg) => setMsgs((xs) => xs.map((m) => (m.role === "assistant" && m.requestId === requestId ? fn(m) : m))), []);

  /** Reads the saved turn until it is no longer running; continues it if it waits at a checkpoint. */
  const follow = useCallback(
    async (id: string, requestId: string) => {
      for (let i = 0; i < 400; i++) {
        await sleep(2500);
        const b = await fetch(`/api/ask/conversations/${id}`).then((r) => r.json()).catch(() => null);
        const m = b?.ok && (b.data.messages as (Msg & { segment: number })[]).find((x) => x.role === "assistant" && x.requestId === requestId);
        if (!m) continue;
        patch(requestId, (x) => ({ ...x, content: m.content, thinking: m.thinking, status: m.status, phase: m.phase }));
        if (m.status === "checkpoint") return run({ continue: { conversationId: id, requestId, segment: m.segment + 1 } }, requestId);
        if (m.status !== "streaming") return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch],
  );

  /** One POST (a question or a continue) and its stream. A request that fails before any reply is retried (same ids). */
  async function run(body: Record<string, unknown>, requestId: string): Promise<void> {
    const ctrl = new AbortController();
    live.current = { requestId, ctrl };
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch("/api/ask/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, profile: profile(), deep }), signal: ctrl.signal });
      } catch {
        if (ctrl.signal.aborted) return;
        await sleep(1000 * 3 ** attempt);
      }
    }
    if (!res) return patch(requestId, (m) => ({ ...m, status: "error", content: `${m.content}${m.content ? "\n\n" : ""}No connection. Tap Retry.` }));
    if (!res.ok || !res.body) {
      const b = await res.json().catch(() => null);
      return patch(requestId, (m) => ({ ...m, status: "error", content: b?.error?.message ?? "The assistant is unavailable right now. Tap Retry." }));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let id = convRef.current;
    let ended: ChatEvent | null = null;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const r = parseSse(buf + dec.decode(value, { stream: true }));
        buf = r.rest;
        for (const e of r.events) {
          if (e.type === "meta") {
            id = e.conversationId;
            if (convRef.current !== id) {
              setConv(id);
              localStorage.setItem(CONV_KEY, id);
            }
          } else if (e.type === "text") patch(requestId, (m) => ({ ...m, content: m.content + e.text, phase: null }));
          else if (e.type === "thinking") patch(requestId, (m) => ({ ...m, thinking: (m.thinking ?? "") + e.text }));
          else if (e.type === "tool") patch(requestId, (m) => ({ ...m, phase: e.label }));
          else if (e.type === "status") patch(requestId, (m) => ({ ...m, phase: e.text }));
          else if (e.type === "replace") patch(requestId, (m) => ({ ...m, content: "" }));
          else if (e.type === "reset") patch(requestId, (m) => ({ ...m, content: "", thinking: null }));
          else if (e.type === "done" || e.type === "error") ended = e;
        }
      }
    } catch {
      // Dropped: the turn goes on on the server; read it below.
    }
    if (live.current?.requestId === requestId) live.current = null;
    if (!ended) {
      if (ctrl.signal.aborted) return;
      patch(requestId, (m) => ({ ...m, phase: "Reconnecting…" }));
      return id ? follow(id, requestId) : undefined;
    }
    const e = ended as ChatEvent;
    if (e.type === "error") return patch(requestId, (m) => ({ ...m, status: "error", phase: null, content: `${m.content}${m.content ? "\n\n" : ""}${e.message}` }));
    if (e.type !== "done") return;
    if (e.outcome === "checkpoint" && id && e.next) {
      patch(requestId, (m) => ({ ...m, status: "streaming", phase: "Still working…" }));
      return run({ continue: { conversationId: id, requestId, segment: e.next } }, requestId);
    }
    if (e.outcome === "running" && id) return follow(id, requestId);
    patch(requestId, (m) => ({ ...m, status: e.outcome === "partial" ? "partial" : e.outcome === "stopped" ? "stopped" : "done", phase: null }));
    if (/remember|budget|bond|prefer|state/i.test(body.message as string ?? "")) setMemVersion((v) => v + 1);
  }

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_INPUT);
    if (!q || busy) return;
    const requestId = newId();
    setMsgs((xs) => [...xs, { requestId, role: "user", content: q }, { requestId, role: "assistant", content: "", status: "streaming", phase: deep ? "Thinking it through…" : "Thinking…" }]);
    setInput("");
    await run({ conversationId: convRef.current ?? undefined, requestId, message: q }, requestId);
  }

  async function stop() {
    const l = live.current;
    const last = [...msgs].reverse().find((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "checkpoint"));
    const requestId = l?.requestId ?? last?.requestId;
    if (!requestId) return;
    if (conv) await fetch(`/api/ask/conversations/${conv}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stop: requestId }) }).catch(() => {});
    l?.ctrl.abort();
    patch(requestId, (m) => ({ ...m, status: "stopped", phase: null }));
  }

  const open = useCallback(
    async (id: string) => {
      const b = await fetch(`/api/ask/conversations/${id}`).then((r) => r.json()).catch(() => null);
      if (!b?.ok) {
        localStorage.removeItem(CONV_KEY);
        return;
      }
      setConv(id);
      localStorage.setItem(CONV_KEY, id);
      const list = b.data.messages as (Msg & { segment: number })[];
      setMsgs(list);
      setPanel(null);
      const last = list.at(-1);
      if (last?.role === "assistant" && last.status === "streaming") follow(id, last.requestId);
      if (last?.role === "assistant" && last.status === "checkpoint") run({ continue: { conversationId: id, requestId: last.requestId, segment: last.segment + 1 } }, last.requestId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [follow],
  );

  useEffect(() => {
    setDeep(localStorage.getItem(DEEP_KEY) === "1");
    const id = localStorage.getItem(CONV_KEY);
    if (id && /^[a-z0-9]{10,40}$/.test(id)) open(id);
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // braces: newer browsers return a promise, never an effect's result
  }, [msgs.length]);

  const questionOf = (requestId: string) => msgs.find((m) => m.role === "user" && m.requestId === requestId)?.content ?? "";

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { setConv(null); setMsgs([]); localStorage.removeItem(CONV_KEY); }}>
          <MessageSquarePlus className="size-4" aria-hidden /> New chat
        </Button>
        <Button type="button" variant={panel === "chats" ? "primary" : "secondary"} size="sm" aria-expanded={panel === "chats"} onClick={() => setPanel(panel === "chats" ? null : "chats")}>
          <History className="size-4" aria-hidden /> Chats
        </Button>
        <Button type="button" variant={panel === "memory" ? "primary" : "secondary"} size="sm" aria-expanded={panel === "memory"} onClick={() => setPanel(panel === "memory" ? null : "memory")}>
          <Brain className="size-4" aria-hidden /> What Seatora remembers
        </Button>
        <label className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" role="switch" checked={deep} onChange={(e) => { setDeep(e.target.checked); localStorage.setItem(DEEP_KEY, e.target.checked ? "1" : "0"); }} className="size-4 accent-[var(--color-sky)]" />
          Deep analysis
        </label>
      </div>
      {panel && (
        <section aria-label={panel === "chats" ? "Past chats" : "What Seatora remembers"} className="rounded-xl border border-border bg-card p-3">
          {panel === "chats" ? <ChatsPanel current={conv} onOpen={open} onDeleted={(id) => id === conv && (setConv(null), setMsgs([]), localStorage.removeItem(CONV_KEY))} /> : <MemoryPanel version={memVersion} />}
        </section>
      )}
      {deep && <p className="text-xs text-muted-foreground">Deep analysis: slower and more thorough; shows how it reasoned.</p>}

      {msgs.length === 0 ? (
        <section aria-label="Suggested questions" className="grid gap-2">
          <p className="text-sm text-muted-foreground">Ask what you can get this round, about a college&apos;s fee, bond and closing ranks, residents, or let it build your choice list.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {starters.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => send(s)} className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm hover:border-sky">{s}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <ol aria-label="Conversation" className="grid gap-4">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 whitespace-pre-wrap text-primary-foreground">
                <span className="sr-only">You: </span>
                {m.content}
              </li>
            ) : (
              <li key={i} className="grid gap-2 rounded-xl border border-border bg-card px-4 py-3" aria-busy={m.status === "streaming" || m.status === "checkpoint"}>
                <span className="sr-only">Ask Seatora:</span>
                {m.thinking && (
                  <details className="rounded-md bg-muted px-3 py-2 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">How I reasoned</summary>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{m.thinking}</p>
                  </details>
                )}
                {m.content ? <Markdown text={m.content} codeAction={(b) => <CopyButton text={b.text} />} /> : null}
                {(m.status === "streaming" || m.status === "checkpoint") && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {m.phase ?? (rowsIn(m.content) > 2 ? `Writing your list… ${rowsIn(m.content)} lines` : m.content ? "Writing…" : "Thinking…")}
                  </p>
                )}
                {m.status === "error" && (
                  <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => send(questionOf(m.requestId))}>
                    <RotateCw className="size-4" aria-hidden /> Retry
                  </Button>
                )}
                {(m.status === "partial" || m.status === "stopped") && i === msgs.length - 1 && (
                  <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => send("Continue from where you stopped.")}>
                    <Play className="size-4" aria-hidden /> Continue
                  </Button>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      <div ref={end} />
      <form
        className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] grid gap-2 rounded-xl border border-border bg-card p-2 md:bottom-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">Your question</label>
        <textarea
          id="ask-input"
          rows={2}
          maxLength={MAX_INPUT}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask what you can get, about a college, or for your choice list…"
          className="w-full resize-none bg-transparent px-2 py-1 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="numeric text-xs text-muted-foreground">{input.length > MAX_INPUT - 200 ? `${input.length}/${MAX_INPUT}` : ""}</span>
          {busy ? (
            <Button type="button" variant="secondary" size="sm" onClick={stop}>
              <Square className="size-4" aria-hidden /> Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()} aria-label="Send">
              <ArrowUp className="size-4" aria-hidden /> Send
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">Answers use Seatora&apos;s MCC data and are saved to your account for 30 days. Closing ranks are history, not a prediction; check important terms with MCC and the college.</p>
    </div>
  );
}
