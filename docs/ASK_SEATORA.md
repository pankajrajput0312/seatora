# Ask Seatora (owner only, beta)

A NEET PG counselling assistant inside Decide: `/decide/ask`. Claude (Opus 5.5 on Amazon Bedrock) answers with **skills** (markdown instructions it loads on demand) and **tools** (validated reads over Seatora's data through `src/features/decide/service.ts`). It weighs her chances with evidence (closing trends, seat change vs last year, bands by a written rule), builds and saves her choice list, writes a printable report, remembers her preferences, and keeps her chats.

## Who can use it
- Off unless `ASK_ENABLED=1`. Even then only a signed-in account on `SEATORA_OWNER_EMAILS` (`features/ask/access.ts` `askUser()`).
- Everyone else: `/decide/ask` and `/decide/ask/report/<id>` render the not-found view (a 200, like every Decide `notFound()`, because `/decide/loading.tsx` streams first; the title never says "Ask Seatora"), and every `/api/ask/*` route answers a real `404 { ok: false, error: { code: "not_found" } }`. Signed out, the middleware sends `/decide/ask` to `/login`.
- The sidebar entry "Ask Seatora · BETA" renders only when `layout.tsx` passes `ask`. No other link, not in the sitemap, `noindex`.
- Chats, preferences and reports are read only by the account that made them.

## Architecture
```
src/features/ask/
  config.ts        env (model, budgets, time); fixed limits (12 rounds, 5 s per tool, 2,000-character question, 20 turns)
  access.ts        askUser(): the owner while enabled, else null
  client.ts        AnthropicBedrockMantle (bearer token AWS_BEARER_TOKEN_BEDROCK, AWS_REGION), maxRetries 2
  agent.ts         system prompt, effort, history trim + summary of older turns, the run loop (checkpoints, stall, check)
  tools.ts         tool schemas (Zod), API definitions, handlers, runTool (validate, time-limit, never throw)
  chances.ts       chance bands, R1 trend, seat change (pure, tested)
  check.ts         the answer check: figures and links against this turn's sources (pure, tested)
  lookup.ts        "Seth GS" / "DNB Anaesthesia" → colleges and courses (pure, tested)
  memory.ts        chats (AskConversation / AskMessage: turns, checkpoints, claims), preferences, 30-day retention
  prefs.ts         preference keys and labels (client-safe)
  budget.ts        AskLog: hourly question limit, daily token budget, usage + timing + check log
  reports.ts       AskReport store and read
  skills.ts        front-matter loader; skills/*.md
  sse.ts           event types and framing
  components/      ask-chat.tsx (chat, resume, deep toggle), ask-panels.tsx (chats, "What Seatora remembers"), markdown.tsx, print-button.tsx
  evals/           cases.json, grade.ts, run.test.ts, fixture-client.ts, fixtures/ (recorded model calls)
src/app/api/ask/chat/route.ts                    POST a question or a continue → text/event-stream (one run)
src/app/api/ask/conversations/route.ts            GET her chats
src/app/api/ask/conversations/[id]/route.ts       GET a chat (the saved turns), DELETE it, POST { stop: requestId }
src/app/api/ask/preferences/route.ts              GET / PUT { key, value } (empty value forgets)
src/app/decide/ask/page.tsx, report/[id]/page.tsx
```

### A turn, run by run (never "took too long")
- The browser sends `{ conversationId?, requestId, message, profile, deep }`. The server stores her question and an answer row (status streaming), so the turn lives in Postgres, not in the connection. A repeated `requestId` replays that turn (or reports it still running) and never runs twice.
- One POST = one **run**. It streams events (`meta`, `text`, `thinking` in deep mode, `tool` / `status` for the live line, `replace` after a correction, `ping` every 10 s) and saves the answer every 2 s plus a **checkpoint** (the model messages after each finished round) as it goes. The run keeps going if the browser disconnects (`after()`), and ends with exactly one `done` or `error`.
- Time only stops new lookups: after `ASK_SOFT_MS` (deep: `ASK_DEEP_SOFT_MS`) the next round answers with what it has. An answer being written is never cut for time. A run that reaches its slice (`ASK_SLICE_MS`, under the route's `maxDuration` 300 s) stops with `done { outcome: "checkpoint", next }`; the browser posts `{ continue: { conversationId, requestId, segment: next } }` at once and the next run resumes from the checkpoint, given the text already shown so it carries on mid-sentence or mid-table. A continue claims its segment atomically: a repeat or a race just reads the turn.
- A run that died (no save for 45 s) is resumable the same way from its last checkpoint; a dropped connection makes the page read the saved turn every 2.5 s (`GET /api/ask/conversations/<id>`) until it finishes or waits at a checkpoint.
- A turn ends only when nothing moves for `ASK_STALL_MS` (no shown text or tool result, counted across runs, so runs that only restart a slow call can't loop) or at the cap `ASK_CAP_MS` from the question: the text so far is kept with "Tap Continue", and a Continue button asks to carry on. Stop (`POST {stop}`) ends it at the next save. Bedrock throttling: the SDK retries twice, then the run retries the call twice more (1 s, 3 s) while nothing was shown; past that, an error event and a Retry button.
- Long lists: `present_choice_list` builds the table and the "Copy in MCC order" block from the data and shows it directly (the model sends short refs like `c12` and a few words each), so a 30-40 line list is instant and can't be cut mid-typing.

### The answer check
Before an answer is final, every figure of 1,000 or more and every ₹ lakh/crore amount must appear in what the turn was given (tool results, the question, earlier turns, her profile and preferences), and every `/decide…` link must be a real page (known routes, institute slugs that exist, report links). If not, the model is asked once to rewrite the whole answer (the browser gets `replace` and the new text). `AskLog.checkPassed / checkFailed / corrected` record it.

### Memory
- **Chats**: saved per account (list, open, continue, delete); kept 30 days after the last activity. The model gets the newest turns within `ASK_HISTORY_TOKENS`; older ones are summarised as a line of her earlier questions.
- **Preferences**: `remember_preference` / `get_preferences` (course priority, budget, bond tolerance, preferred / avoided states, home state, college types, other), shown and editable in "What Seatora remembers"; listed in every request's context so they act as defaults.

### Model settings
- `ASK_MODEL` (default `anthropic.claude-opus-5-5`). Effort `low` for lookups, `medium` for advice and planning, `high` with deep analysis (which also asks for a summarised reasoning, streamed into "How I reasoned"). Thinking can't be disabled on Opus 5.5 and isn't otherwise set. A Haiku model (tests) gets neither effort nor adaptive thinking.
- Prompt caching: breakpoints on the system prompt and the last tool (≈ 5,000 tokens), and on the newest message each round. Her context (date, profile, preferences, older questions) sits after the cached part.
- Tool schemas are **not** grammar-strict: with this many tools a strict grammar took over a minute to compile on first use (and on Haiku failed: "grammar over 300 MB"). Every input is checked with its Zod schema instead; a bad one goes back to the model as a tool error.

### Skills (`src/features/ask/skills/*.md`)
counselling-basics · reading-closing-ranks · fees-stipend-bond · choice-list-strategy · **choice-filling-best-practices** (fill many, order by preference not chance, long shots on top, never fill a seat you won't join, upgrades, Round 3/stray, check bond/fee/leaving, state backup, lock early) · **choice-list-builder** (assess_chances → a decisive answer in five parts: where you stand, chances by band with trend and seat change, recommended order, checklist, next steps; present_choice_list for lists) · dnb-vs-md · residents · seatora-navigation.

### Tools
| Tool | Reads |
| --- | --- |
| assess_chances({courses, rank, category, quotas, states, maxFeeLakh, maxBondYears, govtOnly}) | every option with seats in this round's lists (≈ 0.5 s): closings 2024-2026 by round, R1 trend, seat change vs last year's same round (clear vacancy), fee and bond, banded Likely / Possible / Long shot / Unlikely / No history by the rule in `chances.ts`, top 12 per band, counts and a summary per course and quota |
| present_choice_list({title, items: [{ref, why}]}) | shows the ordered table + copy block itself |
| remember_preference({key, value}), get_preferences() | AskPreference |
| load_skill, get_profile, search_options, college_profile, last_ranks, round_seats, residents_at, compare, schedule, score_to_rank, find_colleges, draft_choice_list, save_choice_list, create_report | as before: the Options, institute, Last ranks, Seats, Residents, Compare, Counselling and Score & rank reads; save_choice_list writes "Ask Seatora plan" into her account's Choices only after she says yes; create_report stores an AskReport |

## Env
| Variable | Default | |
| --- | --- | --- |
| `ASK_ENABLED` | off | `1` turns it on (owner only unless `ASK_FOR_MEMBERS=1`) |
| `ASK_FOR_MEMBERS` | off | `1` opens it to every signed-in member; their plan's questions a day apply (docs/PLANS_AND_ROLES.md; owner and admins unlimited) |
| `AWS_BEARER_TOKEN_BEDROCK` | — | Bedrock API key (sensitive) |
| `AWS_REGION` | `us-east-1` | |
| `ASK_MODEL` | `anthropic.claude-opus-5-5` | |
| `ASK_MAX_OUTPUT_TOKENS` | 8000 | per model call; a longer answer continues in the next round |
| `ASK_HISTORY_TOKENS` | 12000 | rough budget for earlier turns sent |
| `ASK_HOURLY_REQUESTS` | 60 | questions per rolling hour (continue runs don't count) |
| `ASK_DAILY_TOKENS` | 1500000 | input + output + cache writes per UTC day |
| `ASK_SOFT_MS` / `ASK_DEEP_SOFT_MS` | 30000 / 90000 | no new lookups after this (answer with what it has) |
| `ASK_SLICE_MS` | 270000 | one run, then checkpoint and continue; keep under `maxDuration` (300 s) |
| `ASK_STALL_MS` | 60000 | no progress for this long ends the turn (answer kept, Continue) |
| `ASK_CAP_MS` | 600000 | total time for one answer |
`ASK_TIMEOUT_MS` is no longer read: remove it from Vercel.

## Cost (Opus 5.5 list prices: $4 in, $20 out, $0.20 cache read, $5 cache write per million tokens; Bedrock bills its own rates)
Measured on the scratch build, 16 Nov 2026: the broad "what are my possibilities" question at AIR 25,000 Open took 37 s end to end, 3,635 output tokens, ~$0.21; a 30-line choice list 56 s, ~$0.24. Lookups $0.01-0.07. Every run's counts and timings are in `AskLog`:
```sql
SELECT date_trunc('day', "createdAt") d, count(*), sum("inputTokens") i, sum("outputTokens") o, sum("cacheReadTokens") cr, sum("cacheWriteTokens") cw,
       avg(("timing"->>'firstTextMs')::int) first_text_ms, sum("checkFailed") check_failed, count(*) FILTER (WHERE corrected) corrected
FROM "AskLog" GROUP BY 1 ORDER BY 1 DESC;
```

## Tests and evals
- `npm run test`: all plumbing with a mocked model (zero Bedrock calls): SSE framing, tool rounds, the check's rewrite, throttling retries, slices → checkpoint → continue (normal and deep), stall across runs, replay of a repeated request or continue, dropped connection vs Stop, owner gating, banding, the check, lookups, skills; with `DATABASE_URL` also memory (idempotent turns, claims, stale runs, preferences, retention, no cross-account reads), budgets and the tools on the real import.
- `npm run ask:eval:replay` (needs only `DATABASE_URL`): replays recorded model calls (`evals/fixtures/<id>.json`) through the real tools, check and grader; cases without a fixture are skipped.
- `npm run ask:eval` (owner, spends money: 24 cases, ~$2-3): the real model; `ASK_EVAL_RECORD=1` also saves fixtures; `ASK_EVAL_ONLY=id1,id2`, `ASK_EVAL_SHOW=1`. A small `ASK_SLICE_MS` exercises the resume path. The grader checks required tools, words and links, forbidden phrases, numbered rows, run count, time, and that every figure is in a tool result.
```sh
set -a; . ~/.config/seatora/bedrock.env; set +a
DATABASE_URL=<a database with the MCC import> npm run ask:eval
```

## Deploy checklist
1. Migrate (`20261120000000_ask`, `20261121000000_ask_memory`), then on Supabase the lockdown (RLS on, no Data API access for the new tables), as RUNBOOK 1.3 c:
   ```sh
   DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
   "$PG/psql" "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$PLANNER/tools/sql/supabase_lockdown.sql"
   ```
2. Vercel env (Production): `AWS_BEARER_TOKEN_BEDROCK` (sensitive: `printf '%s' "$TOKEN" | npx --yes vercel@latest env add AWS_BEARER_TOKEN_BEDROCK --environment production --sensitive --force`), `AWS_REGION=us-east-1`, `ASK_ENABLED=1`; remove `ASK_TIMEOUT_MS`. Fluid compute on (the chat route asks for `maxDuration = 300`; if the plan allows less, set `ASK_SLICE_MS` about 30 s under that limit; answers then simply take more runs).
3. Deploy. Check: signed out `curl -s -o /dev/null -w '%{http_code}' -X POST https://www.seatora.co.in/api/ask/chat` → 404; a member sees no nav entry; the owner sees "Ask Seatora · BETA", chats and "What Seatora remembers".
4. Turn off: remove `ASK_ENABLED` (or `0`) and redeploy.
