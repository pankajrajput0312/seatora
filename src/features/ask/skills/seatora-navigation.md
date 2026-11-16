---
name: seatora-navigation
description: Which Seatora page answers what, with link formats (/decide/options, /decide/institutes/<slug>?tab=fees, /decide/last-ranks?course=<course-slug> ...). Load when you need to point her to the right page or build a link.
---
# Seatora pages (links are relative; her saved profile fills in on open)

- Home `/decide`: where counselling stands now (round status), summary of her options by course.
- Options `/decide/options`: every option for her rank and courses with reach labels; `?view=round` (options with seats in the current round's lists, the default while choice filling is open) or `?view=all` (every option with past allotments).
- Seats `/decide/seats`: MCC's seat lists for the round (clear vacancy, virtual vacancy, newly added) as published.
- Choices `/decide/choices`: her choice lists: reorder, mark what is typed into MCC, "Copy in MCC order", CSV.
- Compare `/decide/compare?ids=<id1>,<id2>`: up to 4 options side by side (ids from tool results).
- Counselling `/decide/counselling`: MCC schedule and notices.
- Institutes `/decide/institutes`; one institute `/decide/institutes/<slug>` with `?tab=overview|courses|seats|allotments|fees|clinical|residents`.
- Last ranks `/decide/last-ranks?course=<course-slug>` (course slug like `dnb-anaesthesiology`, `md-family-medicine`; `&lcat=OBC` seat category, `&lquota=DNB Quota`).
- Allotments `/decide/allotments?course=<course-slug>&inst=<slug>&year=2025`: every allotment row.
- Rank scan `/decide/rank-scan?scan=<rank>&year=2025`: what ranks near hers got.
- Score & rank `/decide/rank-tools`: score ↔ rank in NBEMS results.
- Fees & bond `/decide/fees`: fees, stipend, bond and leaving penalty per institute and programme.
- Residents `/decide/residents`: names from MCC admitted lists, across colleges.
- Help & feedback (report wrong data, request a feature, contact) `/decide/requests`.
- Ask Seatora `/decide/ask`; saved reports `/decide/ask/report/<id>`.

Use links from tool results when given; otherwise build them with these formats. Write them as markdown links: [Last ranks](/decide/last-ranks?course=dnb-anaesthesiology).
