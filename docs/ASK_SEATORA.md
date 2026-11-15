# Ask Seatora (owner only, beta)

A NEET PG counselling assistant inside Decide: `/decide/ask`. Claude (Opus 5.5 on Amazon Bedrock) answers with **skills** (markdown instructions it loads on demand, like Claude Code skills) and **tools** (validated reads over Seatora's own data through `src/features/decide/service.ts`). It can build her ordered choice list, save it to her Choices, and write a printable plan report.

## Who can use it
- Off unless `ASK_ENABLED=1`. Even then only a signed-in account on `SEATORA_OWNER_EMAILS` (`features/ask/access.ts` `askUser()`).
- Everyone else: `/decide/ask` and `/decide/ask/report/<id>` render the not-found view (a 200 with the not-found page, like every Decide `notFound()`, because `/decide/loading.tsx` streams first; metadata is checked too, so the title never says "Ask Seatora"), and `POST /api/ask/chat` is a real `404 { ok: false, error: { code: "not_found" } }`. Signed out, the middleware sends `/decide/ask` to `/login` like any Decide page.
- The sidebar entry "Ask Seatora" (Help group, "BETA" pill) renders only when `layout.tsx` passes `ask` (the same check). No other link, not in the sitemap, `noindex` (page metadata, the `/decide` and `/api` `X-Robots-Tag`, robots.txt).
- A report opens only for the account that created it.

## Architecture
```
src/features/ask/
  config.ts        env: ASK_ENABLED, ASK_MODEL, budgets, timeouts; fixed limits (8 rounds, 5 s per tool, 2,000-char question, 20 turns)
  access.ts        askUser(): the owner while enabled, else null
  client.ts        AnthropicBedrockMantle (bearer token AWS_BEARER_TOKEN_BEDROCK, AWS_REGION), maxRetries 2
  agent.ts         system prompt (rules + skill index), effort heuristic, history trim, the streamed tool loop
  tools.ts         tool schemas (Zod), API definitions, handlers, runTool (validate, time-limit, never throw)
  lookup.ts        "Seth GS" / "DNB Anaesthesia" → colleges and courses (pure, tested)
  skills.ts        front-matter loader; skills/*.md
  budget.ts        AskLog: hourly request limit, daily token budget, usage log
  reports.ts       AskReport store and read (owner's own only)
  sse.ts           event framing shared by route and client
  components/      ask-chat.tsx (client), markdown.tsx (safe renderer), print-button.tsx
  evals/           cases.json, grade.ts, run.test.ts (npm run ask:eval)
src/app/api/ask/chat/route.ts       POST, text/event-stream
src/app/decide/ask/page.tsx          the chat
src/app/decide/ask/report/[id]/page.tsx   the printable report
```

### The loop (`agent.ts` runAsk)
1. The route checks the owner, parses the body (Zod: messages alternate, the last is hers, ≤ 2,000 characters; ≤ 200 KB), starts an `AskLog` row if she is within her limits (else 429 with a plain message), reads her profile from the page's query string (`profileFromParams`), and trims the history to the newest turns within `ASK_HISTORY_TOKENS` (≈ 4 characters a token) and 20 turns.
2. Each round: `client.messages.stream()` with the tools, the system prompt, `output_config.effort` and the messages; text deltas go to the browser as they arrive; `finalMessage()` gives the stop reason and usage.
3. `tool_use`: every call is validated with its Zod schema and run with a 5 s limit (`runTool`); a bad input, an unknown name, a lookup error or a timeout comes back as an `is_error` tool result the model can recover from (never a crash; no internals). Results go back in one user message. At most 8 rounds; the 8th is sent with `tool_choice: none` so it must answer.
4. `refusal`: a short polite note (NEET PG counselling only). `max_tokens`: the answer so far plus "cut short, ask a narrower question". Bedrock throttling (429 after 2 SDK retries), 5xx, the 60 s deadline (`ASK_TIMEOUT_MS`) and the browser going away (the request's AbortSignal, combined with the deadline, cancels the model call) each end the stream with an `error` event and a plain message. The stream always ends with exactly one `done` or `error` event.
5. The `AskLog` row is finished with token counts, tool names, rounds, latency and outcome, and the same line is logged (`[ask] {...}`). Never the question, the answer, tool inputs or names.

### Model settings
- `ASK_MODEL` (default `anthropic.claude-opus-5-5`). Thinking can't be disabled on Opus 5.5 and isn't set; effort is `low` for lookups and chat, `medium` when the question asks for advice or planning (`chooseEffort`: should, worth, compare, vs, list, plan, which…). No forced `tool_choice` (Opus 5.5 rejects it), no prefill.
- `max_tokens` = `ASK_MAX_OUTPUT_TOKENS` (default 8,000, thinking included) per model call.
- Prompt caching: explicit `cache_control` breakpoints on the stable system block and on the last tool (tools + system ≈ 5,000 tokens, written once and then read at a tenth of the price), plus one on the newest message so each tool round re-reads the conversation from cache. Her profile line and today's date sit in a second system block after the breakpoint. (Top-level automatic caching is not used.)
- Strict tool schemas (grammar-constrained input) allow at most 24 optional parameters in all: `search_options` and `draft_choice_list` are not strict; Zod checks every tool's input anyway.

### Skills (`src/features/ask/skills/*.md`)
Front-matter `name` and `description` (when to use it), then the body. The system prompt lists only names and descriptions; `load_skill(name)` returns a body. Facts come from Seatora's data and docs and the planner's research guide (MCC Information Bulletin NEET-PG 2026, NBEMS notices, NMC regulations), each with its source; when unsure the skill says so.

| Skill | Use |
| --- | --- |
| counselling-basics | rounds, Freeze/Float, free exit, forfeit, deposits, quotas, categories |
| reading-closing-ranks | history not prediction, seat vs candidate category, R2/R3 counts, stray, reach labels |
| fees-stipend-bond | NBEMS ₹1.25 L fee ceiling, ₹43k/45k/47k stipend minimum, bonds vs leaving penalties vs the MCC forfeit, "Not published" |
| choice-list-strategy | ordering principles |
| choice-list-builder | the procedure: preferences → `draft_choice_list` → numbered table + "Copy in MCC order" → `save_choice_list` after she confirms → offer `create_report` |
| dnb-vs-md | recognition, training, fees, stipend, bonds, exams (balanced) |
| residents | admitted lists; never state or infer a category; respectful contact |
| seatora-navigation | which page answers what, link formats |

Add a skill: a new `.md` file with front-matter; `skills.test.ts` lists the expected names, update it. The folder is traced into the chat route's bundle (`next.config.ts` `outputFileTracingIncludes`).

### Tools (`tools.ts`)
All read through the service (no new SQL except the two Ask tables and `UserChoices`), return compact JSON (rows capped at 25), page links and source names.

| Tool | Reads |
| --- | --- |
| load_skill(name) | a skill body |
| get_profile() | her profile from the page's params |
| search_options({courses, rank, category, quotas, states, view, reach, maxFeeLakh, noBond, page}) | `listOptions` (the Options page) |
| college_profile({college, course}) | `getInstitute` + type/beds: per-course fee, stipend, bond, bond penalty, leaving penalty (the stat cells' values), closings, current-round seats |
| last_ranks({course, college, quota, category}) | `lastRanks`, newest year first |
| round_seats({course, state, quota}) | the current round's seat lists (clear, virtual, new; never added) |
| residents_at({college, course, year}) | `listResidents` (gate + read budget as the page): count and names, course, year; no rank, no category |
| compare({colleges[2-4], course}) | `getInstitute` per college, a Compare link |
| schedule() | round status (as the Overview banner) and the latest MCC notices |
| score_to_rank({score, year}) | NBEMS score ↔ rank |
| find_colleges({query, state, type}) | name words, initials ("Seth GS", "GMC Nagpur"), state, type |
| draft_choice_list({courses in priority order, quotas, states, avoidStates, maxFeeLakh, maxBondYears, maxBondPenaltyLakh, types, includeUnknownTerms, limit}) | `listOptions` in the data's view (round: only options with seats in this round's lists), grouped dream / realistic / safe / unknown with facts and option ids |
| save_choice_list({items, mode replace or append, listName, confirmed}) | writes her account's `UserChoices` (the Choices sync format): its own list "Ask Seatora plan", made active; refuses unless `confirmed`; items by id or by college + course + quota |
| create_report({title, summary, choices, risks}) | stores an `AskReport` with each choice's facts, residents counts at the top colleges and sources; returns `/decide/ask/report/<id>` |

A college name that matches several colleges is an error listing them (with slugs), never a silent pick.

### Safety rules (system prompt + skills)
Every number from a tool result or skill, quoted exactly (no rounding into ranges); closing ranks are history, never "you will get", "guaranteed" or a percentage; missing data is "not published in the documents Seatora has" with the official source; never state or infer a resident's category; no medical, legal or financial guarantees; off-topic requests get a short refusal and an offer; `save_choice_list` only after she says yes.

### UI
`/decide/ask`: starter questions from her profile, the conversation (sessionStorage, last 40 messages sent each turn), streamed answers rendered by `markdown.tsx` (React elements only, never HTML strings; links only to `/…` paths and https; tables, lists, fenced blocks with a Copy button), tool activity as a status line, Stop, New chat. Phone: the input sits above the bottom bar.
`/decide/ask/report/<id>`: cover (title, AIR, category, courses, date in IST), where she stands, the ordered list with reasons, fee/stipend/bond of the top 10, residents counts with a link to names, risks, sources, disclaimer; "Download PDF" opens the print dialog (the app's print CSS hides the chrome).

## Env
| Variable | Default | |
| --- | --- | --- |
| `ASK_ENABLED` | off | `1` turns it on (owner only regardless) |
| `AWS_BEARER_TOKEN_BEDROCK` | — | Bedrock API key (sensitive) |
| `AWS_REGION` | `us-east-1` | Bedrock Mantle region |
| `ASK_MODEL` | `anthropic.claude-opus-5-5` | |
| `ASK_MAX_OUTPUT_TOKENS` | 8000 | per model call |
| `ASK_HISTORY_TOKENS` | 12000 | rough budget for the history sent |
| `ASK_HOURLY_REQUESTS` | 60 | per account, rolling hour |
| `ASK_DAILY_TOKENS` | 1500000 | input + output + cache writes per UTC day |
| `ASK_TIMEOUT_MS` | 60000 | whole answer |

## Cost
Per question, measured on the scratch build (see the eval output for the latest): a lookup is 1-3 model calls, advice or a choice list 3-6; input is mostly cache reads of the ≈5,000-token prefix plus tool results. At Anthropic's list prices for Opus 5.5 ($4 input, $20 output, $0.20 cache read, $5 cache write per million tokens; Bedrock bills its own rates) a question cost $0.01-0.02 (a skill lookup), $0.03-0.07 (schedule, a comparison) and $0.11-0.18 (options for her rank, "is it worth it", a choice list, save + report), measured on the scratch build, 16 Nov 2026. The daily budget (1.5 M tokens) caps a bad day at a few dollars. `AskLog` has every request's counts:
```sql
SELECT date_trunc('day', "createdAt") d, count(*), sum("inputTokens") i, sum("outputTokens") o, sum("cacheReadTokens") cr, sum("cacheWriteTokens") cw
FROM "AskLog" GROUP BY 1 ORDER BY 1 DESC;
```

## Evals
`src/features/ask/evals/cases.json` (18 cases: lookups, advice, residents privacy, off-topic, no rank, choice list build/save/report), graded deterministically by `grade.ts`: required tools ran, required words and links present, forbidden phrases absent ("you will get", "guaranteed", category guesses, code, doses), and every number ≥ 1,000 in the answer (years aside) appears in a tool result, the question, the history or her profile. Run (spends real money: the full set was ~$0.92 at list prices, 16 Nov 2026):
```sh
set -a; . ~/.config/seatora/bedrock.env; set +a
DATABASE_URL=<a database with the MCC import> npm run ask:eval          # ASK_EVAL_ONLY=id1,id2 for some; ASK_EVAL_SHOW=1 prints answers
```
It creates and deletes a temporary user, turns the site gate off for the run (no request session in a test) and stubs the residents gate. A run whose lookups crashed fails every case ("a tool lookup failed").

## Deploy checklist
1. Migrate (`20261120000000_ask`: `AskLog`, `AskReport`), then on Supabase run the lockdown (RLS on, no Data API access for the new tables), as RUNBOOK 1.3 c:
   ```sh
   DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
   "$PG/psql" "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$PLANNER/tools/sql/supabase_lockdown.sql"
   ```
2. Vercel env (Production): `AWS_BEARER_TOKEN_BEDROCK` (**sensitive**: `printf '%s' "$TOKEN" | npx --yes vercel@latest env add AWS_BEARER_TOKEN_BEDROCK --environment production --sensitive --force`, as RUNBOOK 3), `AWS_REGION=us-east-1`, `ASK_ENABLED=1`; optional budgets above. `SEATORA_OWNER_EMAILS` must already hold the owner.
3. Deploy. The chat route sets `maxDuration = 90` (s); the plan's function limit must allow it.
4. Check signed out: `curl -s -o /dev/null -w '%{http_code}' -X POST https://www.seatora.co.in/api/ask/chat` → 404; a member account sees no nav entry and the not-found view at `/decide/ask`; the owner sees "Ask Seatora · BETA" and gets an answer.
5. Turn off: remove `ASK_ENABLED` (or set `0`) and redeploy.
