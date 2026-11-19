"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Dialog, Tooltip } from "radix-ui";
import { ArrowUp, Brain, Check, ChevronRight, Copy, FileText, GitCompareArrows, History, IndianRupee, ListOrdered, MessageSquarePlus, Microscope, Play, RotateCw, ShieldAlert, SlidersHorizontal, Square, TrendingUp, X } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { keepProfileParams } from "@/features/decide/profile";
import { Markdown } from "./markdown";
import { ChatsPanel, MemoryPanel } from "./ask-panels";
import { parseSse, type ChatEvent } from "../sse";

// Ask Seatora's chat. The conversation lives on the server (saved per account, 30 days); this tab remembers which chat
// is open. A turn streams in; when a run reaches its time slice the server says "continue" and the next run starts at
// once; if the connection drops, the saved turn is read until it finishes (and continued if it waits at a checkpoint).
// Nothing she sees turns into an error while the answer is still moving.
// Look: Seatora's own (home-hub.tsx): ink, cyan and green, a faint pixel grid; a centred column, composer pinned below.

type Status = "streaming" | "checkpoint" | "done" | "partial" | "error" | "stopped";
/** steps / started / took are this tab's own record of the turn's progress events (not saved; a reopened chat has none). */
type Msg = { requestId: string; role: "user" | "assistant"; content: string; thinking?: string | null; status?: Status; phase?: string | null; segment?: number; steps?: string[]; started?: number; took?: number };
export type Starter = { kind: "list" | "rank" | "fee" | "chances" | "compare" | "bond"; title: string; prompt: string };
const starterIcon = { list: ListOrdered, rank: SlidersHorizontal, fee: IndianRupee, chances: TrendingUp, compare: GitCompareArrows, bond: ShieldAlert };
const CONV_KEY = "seatora.ask.conversation";
const DEEP_KEY = "seatora.ask.deep";
const MAX_INPUT = 2000;
const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Table rows written so far, for "Writing your list… 14 lines". */
const rowsIn = (s: string) => s.match(/^\|\s*\d+\s*\|/gm)?.length ?? 0;
/** A progress event: the new phase, kept as a step unless it repeats the last one. */
const step = (m: Msg, p: string | null | undefined): Msg => ({ ...m, phase: p ?? null, steps: p && m.steps?.at(-1) !== p ? [...(m.steps ?? []), p] : m.steps });
const secs = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const bare = (label: string) => label.replace(/…$/, "");
const isLive = (m: Msg) => m.status === "streaming" || m.status === "checkpoint";
// The logo's colours on the ink tile, whatever the app theme maps sky / leaf to.
const inkMark = { "--color-sky": "#5ccfe6", "--color-leaf": "#5fd36f" } as React.CSSProperties;

function Mark() {
  return (
    <span aria-hidden style={inkMark} className="grid size-7 shrink-0 place-items-center rounded-md bg-[#0b0e12]">
      <LogoMark className="size-4" />
    </span>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content side="bottom" sideOffset={6} className="z-50 rounded-md bg-[#0b0e12] px-2 py-1 text-xs text-[#f1f4f7]">
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

const iconBtn = "grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground" onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true))}>
      {done ? <Check className="size-3.5 text-leaf" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

/** The turn's progress: finished steps ticked, the current one pulsing with the time so far; folded once it is done. */
function Progress({ m, now }: { m: Msg; now: number }) {
  const steps = m.steps ?? [];
  if (!isLive(m)) {
    if (!steps.length) return null;
    return (
      <details className="group/steps text-sm text-muted-foreground">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open/steps:rotate-90" aria-hidden />
          Worked through {steps.length} {steps.length === 1 ? "step" : "steps"}{m.took ? ` · ${secs(m.took)}` : ""}
        </summary>
        <ol className="mt-1 grid gap-1 border-l border-border pl-3">
          {steps.map((s, i) => <li key={i} className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-leaf" aria-hidden />{bare(s)}</li>)}
        </ol>
      </details>
    );
  }
  const current = m.phase ?? (rowsIn(m.content) > 2 ? `Writing your list… ${rowsIn(m.content)} lines` : m.content ? "Writing…" : "Thinking…");
  const done = m.phase && steps.at(-1) === m.phase ? steps.slice(0, -1) : steps;
  return (
    <ol aria-label="Progress" className="grid gap-1 text-sm">
      {done.map((s, i) => <li key={i} className="flex items-center gap-2 text-muted-foreground"><Check className="size-3.5 shrink-0 text-leaf" aria-hidden />{bare(s)}</li>)}
      <li className="flex items-center gap-2 font-medium">
        <span aria-hidden className="grid size-3.5 shrink-0 place-items-center"><span className="size-2 animate-pulse bg-[#5ccfe6] ring-2 ring-[#5ccfe6]/30" /></span>
        <span className="min-w-0">{current}</span>
        {m.started ? <span className="numeric ml-auto shrink-0 text-xs font-normal text-muted-foreground">{secs(now - m.started)}</span> : null}
      </li>
    </ol>
  );
}

/** `profileParams`: the profile to send (another exam is active: her NEET PG one); absent, the URL's. */
export function AskChat({ starters, youLine, head, profileParams }: { starters: Starter[]; youLine: string | null; head: React.ReactNode; profileParams?: string }) {
  const sp = useSearchParams();
  const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [deep, setDeep] = useState(false);
  const [panel, setPanel] = useState<"chats" | "memory" | null>(null);
  const [memVersion, setMemVersion] = useState(0);
  const live = useRef<{ requestId: string; ctrl: AbortController } | null>(null);
  const convRef = useRef<string | null>(null);
  convRef.current = conv;
  const profile = () => profileParams ?? keepProfileParams(new URLSearchParams(sp.toString())).toString();
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
        patch(requestId, (x) => ({ ...step(x, m.phase), content: m.content, thinking: m.thinking, status: m.status }));
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
          else if (e.type === "tool") patch(requestId, (m) => step(m, e.label));
          else if (e.type === "status") patch(requestId, (m) => step(m, e.text));
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
    patch(requestId, (m) => ({ ...m, status: e.outcome === "partial" ? "partial" : e.outcome === "stopped" ? "stopped" : "done", phase: null, took: m.started && Date.now() - m.started }));
    if (/remember|budget|bond|prefer|state/i.test(body.message as string ?? "")) setMemVersion((v) => v + 1);
  }

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_INPUT);
    if (!q || busy) return;
    const requestId = newId();
    setMsgs((xs) => [...xs, { requestId, role: "user", content: q }, { requestId, role: "assistant", content: "", status: "streaming", phase: deep ? "Thinking it through…" : "Thinking…", started: Date.now() }]);
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
    patch(requestId, (m) => ({ ...m, status: "stopped", phase: null, took: m.started && Date.now() - m.started }));
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
  // Follow the answer down while she is at the bottom; leave her be once she scrolls up to read.
  const stick = useRef(true);
  useEffect(() => {
    const on = () => (stick.current = innerHeight + scrollY >= document.documentElement.scrollHeight - 160);
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    stick.current = true;
  }, [msgs.length]);
  useEffect(() => {
    if (stick.current && msgs.length) scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); // the very end: the pinned composer would cover the last lines; instant, as a smooth scroll's midway events would unstick it
  }, [msgs]);
  // The clock beside the current step.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  // The box grows with what she types, up to ~8 lines.
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  const newChat = () => {
    setConv(null);
    setMsgs([]);
    localStorage.removeItem(CONV_KEY);
    box.current?.focus();
  };
  const setDeepTo = (on: boolean) => {
    setDeep(on);
    localStorage.setItem(DEEP_KEY, on ? "1" : "0");
  };
  const lastAnswer = msgs.findLast((m) => m.role === "assistant");
  const announce = lastAnswer && isLive(lastAnswer) ? (lastAnswer.phase ?? (lastAnswer.content ? "Writing the answer" : "Thinking")) : lastAnswer?.status === "done" ? "Answer ready" : "";


  const questionOf = (requestId: string) => msgs.find((m) => m.role === "user" && m.requestId === requestId)?.content ?? "";

  return (
    <Tooltip.Provider delayDuration={300}>
      {/* Full height under the app's top bar (phones: above the bottom bar too), so the composer rests at the bottom. */}
      <div className="mx-auto flex min-h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] w-full max-w-[760px] min-w-0 flex-col max-md:-mb-12 md:min-h-[calc(100dvh-5.5rem)]">
        <header className="flex items-center gap-2">
          {head}
          <span className="rounded-full bg-sky px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">BETA</span>
          <span className="ml-auto flex items-center gap-0.5">
            <Tip label="New chat">
              <button type="button" aria-label="New chat" className={iconBtn} disabled={busy || !msgs.length} onClick={newChat}>
                <MessageSquarePlus className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            </Tip>
            <Tip label="Chat history">
              <button type="button" aria-label="Chat history" aria-haspopup="dialog" className={iconBtn} onClick={() => setPanel("chats")}>
                <History className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            </Tip>
            <Tip label="What Seatora remembers">
              <button type="button" aria-label="What Seatora remembers" aria-haspopup="dialog" className={iconBtn} onClick={() => setPanel("memory")}>
                <Brain className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            </Tip>
          </span>
        </header>

        <p role="status" className="sr-only">{announce}</p>

        <div className="flex-1 py-4">
          {msgs.length === 0 ? (
            <div className="grid gap-4">
              <section aria-labelledby="ask-hello" className="relative overflow-hidden rounded-xl border border-[#1f2a33] bg-[#0b0e12] text-[#f1f4f7]">
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#5ccfe6_1px,transparent_1px),linear-gradient(90deg,#5ccfe6_1px,transparent_1px)] [background-size:14px_14px]" />
                <div className="relative p-4 sm:p-5">
                  <p className="font-mono text-[11px] tracking-[0.25em] text-[#5ccfe6]">▮ ASK SEATORA</p>
                  <h2 id="ask-hello" className="mt-2 text-xl leading-tight font-bold tracking-tight sm:text-2xl" style={{ color: "#f1f4f7" }}>
                    What should we work out this round?
                  </h2>
                  {youLine ? (
                    <p className="numeric mt-2 text-sm font-semibold text-[#5fd36f]">{youLine}</p>
                  ) : (
                    <p className="mt-2 text-sm text-[#a3abb3]">Set your rank (top of the page) and answers fit your rank, category and courses.</p>
                  )}
                  <p className="mt-1 max-w-xl text-sm text-[#a3abb3]">Ask about your options, a college&apos;s fee, bond and closing ranks, its residents, or let it build your choice list.</p>
                </div>
              </section>
              <section aria-labelledby="ask-try">
                <h2 id="ask-try" className="mb-2 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Try asking</h2>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {starters.map(({ kind, title, prompt }) => {
                    const Icon = starterIcon[kind];
                    return (
                      <li key={kind}>
                        <button type="button" onClick={() => send(prompt)} className="group flex h-full w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left hover:border-[#5ccfe6]">
                          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#0b0e12] text-[#5ccfe6]">
                            <Icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{title}</span>
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{prompt}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          ) : (
            <ol aria-label="Conversation" className="grid gap-6">
              {msgs.map((m, i) => {
                if (m.role === "user")
                  return (
                    <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 break-words whitespace-pre-wrap text-primary-foreground">
                      <span className="sr-only">You: </span>
                      {m.content}
                    </li>
                  );
                const report = m.content.match(/\/decide\/ask\/report\/[A-Za-z0-9]+/)?.[0];
                const last = i === msgs.length - 1;
                return (
                  <li key={i} className="group grid grid-cols-[auto_minmax(0,1fr)] gap-3" aria-busy={isLive(m)}>
                    <Mark />
                    <div className="grid min-w-0 gap-3 pt-0.5">
                      <span className="sr-only">Ask Seatora:</span>
                      <Progress m={m} now={now} />
                      {m.thinking && (
                        <details className="rounded-lg bg-muted px-3 py-2 text-sm">
                          <summary className="cursor-pointer text-muted-foreground">How I reasoned</summary>
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{m.thinking}</p>
                        </details>
                      )}
                      {m.content ? <Markdown text={m.content} codeAction={(b) => <CopyButton text={b.text} />} /> : null}
                      {m.status === "error" && (
                        <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => send(questionOf(m.requestId))}>
                          <RotateCw className="size-4" aria-hidden /> Retry
                        </Button>
                      )}
                      {(m.status === "partial" || m.status === "stopped") && last && (
                        <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={busy} onClick={() => send("Continue from where you stopped.")}>
                          <Play className="size-4" aria-hidden /> Continue
                        </Button>
                      )}
                      {!isLive(m) && m.status !== "error" && m.content && (
                        <div className={`-ml-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${last ? "" : "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"}`}>
                          <CopyButton text={m.content} label="Copy answer" />
                          {report && (
                            <Link href={report} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 hover:bg-muted hover:text-foreground">
                              <FileText className="size-3.5" aria-hidden /> Open report to print
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 bg-card pt-1 pb-2 md:bottom-0 md:pb-4 print:hidden">
          <form
            className="rounded-2xl border border-input/50 bg-card shadow-sm focus-within:border-ring"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="ask-input" className="sr-only">Your question</label>
            <textarea
              id="ask-input"
              ref={box}
              rows={1}
              maxLength={MAX_INPUT}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              aria-describedby="ask-keys"
              placeholder="Ask about colleges, fees, your list…"
              className="block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            />
            <span id="ask-keys" className="sr-only">Enter sends; Shift and Enter starts a new line.</span>
            <div className="flex items-center gap-2 p-2 pt-1">
              <Tip label={deep ? "Deep analysis on: slower, more thorough, shows its reasoning" : "Deep analysis: slower, more thorough, shows its reasoning"}>
                <button
                  type="button"
                  aria-pressed={deep}
                  onClick={() => setDeepTo(!deep)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${deep ? "border-transparent bg-[#0b0e12] text-[#5ccfe6]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Microscope className="size-3.5" aria-hidden /> Deep analysis
                </button>
              </Tip>
              <span className="numeric ml-auto text-xs text-muted-foreground">{input.length > MAX_INPUT - 200 ? `${input.length}/${MAX_INPUT}` : ""}</span>
              {busy ? (
                <Tip label="Stop">
                  <button type="button" aria-label="Stop the answer" onClick={stop} className="grid size-9 place-items-center rounded-full bg-[#0b0e12] text-[#5ccfe6]">
                    <Square className="size-3.5 fill-current" aria-hidden />
                  </button>
                </Tip>
              ) : (
                <button type="submit" aria-label="Send" disabled={!input.trim()} className="grid size-9 place-items-center rounded-full bg-[#0b0e12] text-[#5ccfe6] disabled:bg-muted disabled:text-muted-foreground">
                  <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
                </button>
              )}
            </div>
          </form>
          <p className="mt-1.5 text-center text-[11px] leading-tight text-muted-foreground">Seatora&apos;s MCC data, saved 30 days. Closing ranks are history, not a prediction; check key terms with MCC and the college.</p>
        </div>
      </div>

      {/* Past chats and memory: a sheet from the left (phones: from the bottom). Portalled into .app: above the shell's bars, with the app's tokens. */}
      <Dialog.Root open={panel != null} onOpenChange={(o) => !o && setPanel(null)}>
        <Dialog.Portal container={typeof document === "undefined" ? undefined : document.querySelector<HTMLElement>(".app")}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="ask-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-xl md:inset-y-0 md:right-auto md:left-0 md:max-h-none md:w-[24rem] md:rounded-none md:rounded-r-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border p-3">
              <Dialog.Title className="text-base font-semibold">{panel === "memory" ? "What Seatora remembers" : "Chat history"}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" className={`${iconBtn} ml-auto`}>
                  <X className="size-5" aria-hidden />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex gap-1 px-3 pt-3" role="group" aria-label="Show">
              {(["chats", "memory"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={panel === k} onClick={() => setPanel(k)} className={`h-8 rounded-full px-3 text-xs font-medium ${panel === k ? "bg-[#0b0e12] text-[#5ccfe6]" : "text-muted-foreground hover:bg-muted"}`}>
                  {k === "chats" ? "Chats" : "Memory"}
                </button>
              ))}
              {panel === "chats" && (
                <button type="button" disabled={busy} onClick={() => { newChat(); setPanel(null); }} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-sky hover:bg-muted disabled:opacity-40">
                  <MessageSquarePlus className="size-3.5" aria-hidden /> New chat
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {panel === "memory" ? <MemoryPanel version={memVersion} /> : <ChatsPanel current={conv} onOpen={open} onDeleted={(id) => id === conv && (setConv(null), setMsgs([]), localStorage.removeItem(CONV_KEY))} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Tooltip.Provider>
  );
}
