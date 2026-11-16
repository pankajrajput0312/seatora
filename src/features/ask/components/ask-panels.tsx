"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PREF_KEYS, prefLabel, type PrefKey } from "../prefs";

// The Ask page's two side panels: past chats (open, delete) and "What Seatora remembers" (edit, forget).

type Chat = { id: string; title: string; updatedAt: string };

export function ChatsPanel({ current, onOpen, onDeleted }: { current: string | null; onOpen: (id: string) => void; onDeleted: (id: string) => void }) {
  const [chats, setChats] = useState<Chat[] | null>(null);
  useEffect(() => {
    fetch("/api/ask/conversations")
      .then((r) => r.json())
      .then((b) => setChats(b.ok ? b.data : []))
      .catch(() => setChats([]));
  }, [current]);
  if (!chats) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!chats.length) return <p className="text-sm text-muted-foreground">No saved chats yet. Chats are kept for 30 days.</p>;
  return (
    <ul className="grid grid-cols-1 gap-1">
      {chats.map((c) => (
        <li key={c.id} className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={() => onOpen(c.id)} className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted ${c.id === current ? "bg-muted font-semibold" : ""}`}>
            <span className="min-w-0 flex-1 truncate">{c.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Delete chat: ${c.title}`}
            onClick={async () => {
              if (!confirm("Delete this chat?")) return;
              const r = await fetch(`/api/ask/conversations/${c.id}`, { method: "DELETE" });
              if (r.ok) {
                setChats((xs) => xs?.filter((x) => x.id !== c.id) ?? null);
                onDeleted(c.id);
              }
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function MemoryPanel({ version }: { version: number }) {
  const [prefs, setPrefs] = useState<Partial<Record<PrefKey, string>> | null>(null);
  const [editing, setEditing] = useState<PrefKey | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    fetch("/api/ask/preferences")
      .then((r) => r.json())
      .then((b) => setPrefs(b.ok ? b.data : {}))
      .catch(() => setPrefs({}));
  }, [version]);
  const save = async (key: PrefKey, value: string) => {
    const r = await fetch("/api/ask/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const b = await r.json().catch(() => null);
    if (b?.ok) setPrefs(b.data);
    setEditing(null);
  };
  if (!prefs) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">Ask Seatora uses these as defaults. Tell it in chat (&quot;remember my budget is ₹10 L&quot;) or edit them here.</p>
      <dl className="grid gap-1 text-sm">
        {PREF_KEYS.map((k) => (
          <div key={k} className="grid gap-0.5 rounded-md px-2 py-1 hover:bg-muted">
            <dt className="text-xs text-muted-foreground">{prefLabel[k]}</dt>
            <dd className="flex items-center gap-1">
              {editing === k ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(k, draft);
                  }}
                >
                  <label htmlFor={`pref-${k}`} className="sr-only">{prefLabel[k]}</label>
                  <input id={`pref-${k}`} autoFocus maxLength={300} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm" />
                  <Button type="submit" variant="ghost" size="sm" aria-label="Save"><Check className="size-4" aria-hidden /></Button>
                  <Button type="button" variant="ghost" size="sm" aria-label="Cancel" onClick={() => setEditing(null)}><X className="size-4" aria-hidden /></Button>
                </form>
              ) : (
                <>
                  <span className={`flex-1 ${prefs[k] ? "" : "text-muted-foreground"}`}>{prefs[k] ?? "—"}</span>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${prefLabel[k]}`} onClick={() => { setDraft(prefs[k] ?? ""); setEditing(k); }}><Pencil className="size-3.5" aria-hidden /></Button>
                  {prefs[k] && <Button type="button" variant="ghost" size="sm" aria-label={`Forget ${prefLabel[k]}`} onClick={() => save(k, "")}><Trash2 className="size-3.5" aria-hidden /></Button>}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
