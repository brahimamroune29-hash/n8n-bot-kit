# Adapting the bot

Change the code in `code/*.js` or the templates, run `node --test $SKILL_DIR/test/*.test.mjs`, rebuild, then update the workflow (`update_workflow`, or archive and create again). Tests first when you change a rule.

## Bookings instead of orders (clinic, academy, salon, any service)
- `bot_products` becomes the services: `name` = the service, `price`, `options` = the open slots, each one a value (`السبت 10:00، السبت 11:00، الأحد 10:00`), `notes` = duration or preparation. The guard then accepts only a slot the owner wrote.
- In `code/build-request.js`, the purchase rule becomes: collect the service, one slot from `options` (as the order `option`), name and phone; `address` can hold a note.
- In `code/apply-guards.js`, rename the summary and confirmation texts (طلب → حجز); keep the same `order` → `confirm` flow so «confirmed» still needs a shown summary. Delivery fee: leave `delivery_fee` empty.
- A reminder the day before a booking is a new scheduled workflow on `bot_orders`, built like `follow-ups.ts`.

## Another dialect or country
- Replies from the AI follow `bot_settings.tone`.
- The fixed texts written by the code (summary, confirmation, handoff, «let me check») are in `code/apply-guards.js`, in simple standard Arabic. Rewrite them if the owner wants a dialect.
- `currency`, `delivery_fee` and `timezone` are settings.
- Opt-out words are one regular expression near the top of `apply-guards.js`: add the local words for «stop sending me messages».

## Only one channel
Build only `whatsapp.ts` or only `facebook.ts`. Owner alerts go through WhatsApp (`owner_phone` and the Wasender credential). Without WhatsApp, change the `Alert the owner` node in `brain.ts` to the owner's preferred channel (Telegram, email) and leave `bot · send` for customers only.

## Product photos
Not included. Add an image send to `bot · send` (Wasender `imageUrl`, Graph `attachment`) and a `photo_url` column in `bot_products` when the owner asks for it.

## Changing what the model is told
`code/build-request.js` writes the system prompt from `bot_settings` and `bot_products`. Facts belong in `about` and `faq`, not in the code, so the owner can fix them in the table.
