---
name: choice-list-builder
description: Step-by-step procedure for "what can I get", "where are my possibilities", a choice list or wishlist - assess_chances for the evidence, present_choice_list for the list (never type long tables), a decisive answer in five parts, save_choice_list after she confirms, create_report on request. Load whenever she asks what to fill, what she can get, or for a list or plan.
---
# What she can get, and her choice list

## 1. Preferences (only what is missing)
Use her profile and her saved preferences (listed in the context). Ask at most one short question if courses are unknown; otherwise use her profile's courses and say which defaults you used. If she states a lasting preference, save it (remember_preference).

## 2. Evidence: one call
Call `assess_chances` (her courses, quotas, budget, bond cap, govtOnly if she wants only government). It returns every option with seats in this round's lists, banded Likely / Possible / Long shot / Unlikely / No history by a written rule, with the R1 trend, seat change vs last year's same round, fee and bond, and a summary per course and quota. Load `choice-filling-best-practices`. Don't call more tools unless something specific is missing.

## 3. The answer: decisive, in this order
1. **Where you stand** (2-3 lines with numbers from the summary): e.g. "At AIR 25,000 Open, government MD Anaesthesiology closed before your rank in R1/R2 everywhere; 7 seats were reached in R3 in 2024/2025; clear seats are up 18% on 2025 R2."
2. **Your chances, by band**: a compact table per band (Likely, Possible, Long shot; at most 8 rows each) with College · Course · Quota · Trend (arrow + R1 numbers) · Seat change · Why (one line from `why`). Bands are history, not a prediction: say the rule once in a line.
3. **Recommended strategy and order**: what to put first and why (long shots at the top, then possible, then likely; course priority), what to leave out (fee, bond, a seat she would not join). Say it plainly: "Fill these 6 long shots first, then…".
4. **Checklist**: 3-6 best-practice bullets that fit her case.
5. **Next steps**: dates from `schedule` (choice filling, locking, result), what to check (bond documents), and offer: "Shall I lay these out as your full list and save it to your Choices?"

## 4. A full list (any list over ~8 lines)
Call `present_choice_list` with the items in her order: each `ref` from this turn's assess_chances or draft_choice_list result plus a few-word `why`. Seatora shows her the table and a "Copy in MCC order" block itself, instantly; do not type the rows again. Then add only the reasoning for the order, the checklist and next steps. For 20-40 lines this is the only way.

## 5. Save and report (only with her explicit yes)
Ask: "Save this as 'Draft from Ask Seatora' in your Choice list (replace that draft, or append)?" Only after she says yes in her own message, call `save_choice_list` (items: refs from this turn, else college with state and PIN + course + quota exactly as in the table; mode; confirmed: true). After a list, offer a printable report; on yes call `create_report` and give its link.
