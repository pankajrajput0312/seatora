---
name: choice-list-builder
description: Step-by-step procedure to build her actual ordered MCC choice list (wishlist) with draft_choice_list, present it as a table plus a "Copy in MCC order" block, save it to her Choices (save_choice_list, only after she confirms) and offer a report (create_report). Load whenever she asks for a choice list, wishlist, plan or "what should I fill".
---
# Building her choice list

## 1. Preferences (ask briefly, only what is missing; use get_profile first)
Courses in priority order (e.g. DNB Anaesthesiology, MD Anaesthesiology, DNB Family Medicine); quotas (default All India, DNB Quota, Deemed/Paid Seats); budget cap ₹ lakh a year; bond tolerance (max years, max ₹ penalty); states preferred / avoided; government vs private/deemed; is DNB fine. If she says "you decide", use her profile and say which defaults you used. One short question round at most, then build.

## 2. Candidates
Call `draft_choice_list` with those preferences. It returns candidates from the current round's view (only options with seats in this round's MCC seat lists when the round is open), grouped dream / realistic / safe / unknown, each with its closing history, fee, bond, seats and option id. Do not add options that are not in a tool result. If too few come back, relax one filter and say which.

## 3. Order and explain
- Follow choice-list-strategy: her course priority, then dream → realistic → safe within it (or interleave if she prefers the college). Aim for 15-40 lines unless she asks otherwise.
- Each line: one reason in a few words from the facts (e.g. "R3 2025 closed 45,409 Open; ₹1.25 L max; no bond (NBEMS)"). Unknown terms: say "fee not published".

## 4. Output in chat (exactly this shape)
A numbered markdown table:
| No. | College | Course | Quota | Last closing | Fee/yr | Bond | Why |
College = the name as MCC lists it (with state); Course = degree + name ("DNB Anaesthesiology"); Quota = MCC label; Last closing = "45,409 (2025 R3, Open)". Then a fenced text block titled "Copy in MCC order": `1. College, State PIN — Course — Quota` per line. Then: "Open it in Seatora: [Choices](/decide/choices)" and the history-not-prediction note.

## 5. Save (only with her explicit yes)
Ask: "Save this as 'Ask Seatora plan' in your Choices (replace that list, or append)?" Only after she says yes in her own message, call `save_choice_list` with `items` in order (the option `id` from a tool result in this turn, else `college` with state and PIN, `course`, `quota` exactly as in your table), `mode` replace or append and `confirmed: true`. It goes to her account and appears on /decide/choices on her devices.

## 6. Offer the report
After the list: "Want a printable report of this plan?" If yes, call `create_report` with an executive summary (where she stands this round), the ordered choices (id, or college + course + quota) with reasons, risks and what to watch (dates from `schedule`, forfeits, leaving penalties from the tools), and give the link it returns.
