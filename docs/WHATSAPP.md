# Ask Seatora on WhatsApp

The Ask assistant (docs/ASK_SEATORA.md) answering on a WhatsApp number: same tools, memory, plan limits and answer check,
plus two WhatsApp tools and chat rules (`src/features/whatsapp/bot.ts`).

## How a message flows
1. Meta posts it to `/api/whatsapp/webhook`. The signature (app secret) is checked; the route answers 200 at once and
   replies after the response (`after`). Meta redelivers anything slow, so the message id is the turn's request id: a
   repeat never runs twice.
2. The number is one Seatora account (`User.phone`), made on its first message with a placeholder email and a password
   nobody knows (`createdVia: "whatsapp"`). Its profile is the account's `UserProfile`, as on the site.
3. One rolling chat per number (an `AskConversation` titled "WhatsApp", 30 days).
4. The assistant replies in short WhatsApp messages. Fixed options (course, category, what next) come as buttons (≤ 3)
   or a list (≤ 10) through `offer_choices`; a tap comes back as the option's title. Rank and college names are typed.
   `update_profile` saves her AIR, category and courses, then `assess_chances` runs on them.

Rules borrowed from the voice agent (gsy-voice-agent): one question per message, never echo her answer, never invent,
her language and script, honest about being a bot.

## Setup
1. Meta Business account (verified) → app at developers.facebook.com → add WhatsApp → a number not on the WhatsApp app.
2. Env (Vercel): `WHATSAPP_TOKEN` (System User permanent token), `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN` (any string), plus Ask's own (`AWS_BEARER_TOKEN_BEDROCK`, `ASK_MODEL`…).
3. Webhook: `https://www.seatora.co.in/api/whatsapp/webhook`, the same verify token, subscribe to `messages`.
4. `npx prisma migrate deploy` (adds `User.phone`).

No template is needed: she writes first, and every reply is inside WhatsApp's 24-hour window.

## Limits
- Text only; voice notes and images get a "please type" reply.
- Two messages sent within seconds run as two turns side by side.
