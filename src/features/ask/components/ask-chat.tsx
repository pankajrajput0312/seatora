"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Check, Copy, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { keepProfileParams } from "@/features/decide/profile";
import { Markdown } from "./markdown";
import { parseSse, type ChatEvent } from "../sse";

// Ask Seatora's chat: the conversation lives in this tab (sessionStorage) and is sent each turn (the server keeps
// nothing but usage counts). Answers stream in; tool activity shows as a status line.

type Msg = { role: "user" | "assistant"; content: string; error?: true };
const KEY = "seatora.ask";
const MAX_INPUT = 2000;
const KEEP = 40; // messages (20 turns) kept and sent

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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setMsgs(saved.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string"));
    } catch {}
  }, []);
  useEffect(() => {
    if (!busy) sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-KEEP)));
  }, [msgs, busy]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // braces: newer browsers return a promise, never an effect's result
  }, [msgs.length, activity]);

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_INPUT);
    if (!q || busy) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error && m.content), { role: "user" as const, content: q }].slice(-KEEP);
    setMsgs([...msgs, { role: "user", content: q }, { role: "assistant" as const, content: "" }]);
    setInput("");
    setBusy(true);
    setActivity("Thinking…");
    const ctrl = new AbortController();
    abort.current = ctrl;
    const append = (t: string, error?: true) =>
      setMsgs((xs) => {
        const last = xs.at(-1)!;
        return [...xs.slice(0, -1), { ...last, content: last.content + t, ...(error && { error }) }];
      });
    try {
      const res = await fetch("/api/ask/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), profile: keepProfileParams(new URLSearchParams(sp.toString())).toString() }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        append(body?.error?.message ?? "The assistant is unavailable right now.", true);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const r = parseSse(buf + dec.decode(value, { stream: true }));
        buf = r.rest;
        for (const e of r.events as ChatEvent[]) {
          if (e.type === "text") {
            setActivity(null);
            append(e.text);
          } else if (e.type === "tool") setActivity(e.label);
          else if (e.type === "error") {
            ended = true;
            append(`\n\n${e.message}`, true);
          } else if (e.type === "done") ended = true;
        }
      }
      if (!ended) append("\n\n(The answer stopped early. Try again.)", true);
    } catch {
      if (!ctrl.signal.aborted) append("\n\nConnection lost. Try again.", true);
      else append("\n\n_(Stopped.)_");
    } finally {
      setBusy(false);
      setActivity(null);
      abort.current = null;
    }
  }

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4">
      {msgs.length === 0 ? (
        <section aria-label="Suggested questions" className="grid gap-2">
          <p className="text-sm text-muted-foreground">Ask about options for your rank, a college&apos;s fee, bond and closing ranks, this round&apos;s seats, residents, or let it draft your choice list.</p>
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
          {msgs.map((m, i) => (
            <li key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 whitespace-pre-wrap text-primary-foreground" : "rounded-xl border border-border bg-card px-4 py-3"}>
              <span className="sr-only">{m.role === "user" ? "You:" : "Ask Seatora:"}</span>
              {m.role === "user" ? m.content : m.content ? <Markdown text={m.content} codeAction={(b) => <CopyButton text={b.text} />} /> : <span className="text-sm text-muted-foreground">…</span>}
            </li>
          ))}
        </ol>
      )}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{activity}</p>
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
          placeholder="Ask about colleges, ranks, fees, bonds or your choice list…"
          className="w-full resize-none bg-transparent px-2 py-1 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy || !msgs.length} onClick={() => { setMsgs([]); sessionStorage.removeItem(KEY); }}>
            <RotateCcw className="size-4" aria-hidden /> New chat
          </Button>
          <span className="flex items-center gap-2">
            <span className="numeric text-xs text-muted-foreground">{input.length > MAX_INPUT - 200 ? `${input.length}/${MAX_INPUT}` : ""}</span>
            {busy ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => abort.current?.abort()}>
                <Square className="size-4" aria-hidden /> Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!input.trim()} aria-label="Send">
                <ArrowUp className="size-4" aria-hidden /> Send
              </Button>
            )}
          </span>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">Answers use Seatora&apos;s MCC data; closing ranks are history, not a prediction. Check important terms with MCC and the college.</p>
    </div>
  );
}
