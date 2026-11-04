---
name: chat-bot
description: Build a customer chat bot inside n8n through n8n's built-in MCP server — WhatsApp (Wasender), Instagram and Messenger (a Facebook Page) — from tested workflow templates and data tables. It answers from the shop's products and info, takes orders with prices computed in code, confirms only after the customer saw the summary, blocks invented prices, hands off to a human, follows up twice at most, understands voice notes and alerts the owner on any failure. Use when the user wants a chat bot, a WhatsApp / Instagram / Messenger bot, an AI sales or booking assistant, or auto-replies to customers in n8n.
---

# Chat bot in n8n

Everything is built in the user's n8n through the n8n MCP tools (`create_data_table`, `validate_workflow`, `create_workflow_from_code`, `publish_workflow`…). If those tools are missing, the MCP server is not connected: give the user the steps in [references/setup.md](references/setup.md#1-connect-n8n-to-claude) and stop.

`SKILL_DIR` below = the "Base directory for this skill" path.

## Working with the user
- Speak their language, simply. Ask at most 3 questions per round, each with a recommended default.
- Every workflow is created unpublished. Publish only after the user says yes.
- Never ask for API keys in chat: the user types them into n8n credentials.
- The MCP server can add table rows but cannot read, change or delete them. When a cell must change (`bot_enabled`, `test_numbers`, a price), tell the user exactly which table, row and value to edit in n8n → Data tables. To read rows, create a one-off workflow (Manual Trigger → Data table «get»), run it with `execute_workflow`, read it with `get_workflow_execution` (`includeData`), then archive it.

## What gets built
| Workflow | Does |
|---|---|
| `bot · send` | one sender for every channel (Wasender, Graph API); long replies are cut into pieces for Instagram and Messenger |
| `bot · brain` | skip duplicates → owner typing or our own echo → voice to text → save → wait 8 s for more typing → AI → check again that no newer message came → guards → save the order → update the chat → alert the owner → reply |
| `bot · whatsapp` | Wasender webhook, checked with the secret header → brain |
| `bot · facebook` | Meta verification (GET) and messages signed with the app secret (POST) → brain |
| `bot · follow-ups` | every 15 min: at most 2 nudges, never 22:00–09:00, never after an opt-out or while the owner has the chat, inside Meta's 24 h window |
| `bot · errors` | any failed run of the others → one WhatsApp line to the owner with the link |

Five data tables hold the shop and the conversations: [references/tables.md](references/tables.md).

## Steps
Each step ends when its output exists.

1. **Interview.** Shop name, what it sells (each size or variant with its own price is its own product), delivery and payment, currency, delivery fee, the tone or dialect for replies, the owner's WhatsApp number for alerts, a second phone for testing, time zone, channels. Booking business instead of a shop → read [references/adapting.md](references/adapting.md) first.
2. **Credentials.** The user creates them in n8n with the exact names in [references/setup.md](references/setup.md#2-credentials) (only those for their channels). Then `list_credentials` and write `creds.json` in the project: `{"<credential name>": "<id>"}`.
3. **Tables.** `search_projects` for the project id; use the same id for every table and workflow. `create_data_table` five times with the exact names and columns of tables.md. Fill `bot_settings` (every key in tables.md, `test_numbers` = the test phone) and `bot_products` with `add_data_table_rows`.
4. **Build.** Always `node $SKILL_DIR/build.mjs <project>/n8n --creds creds.json --ids ids.json` (an empty `{}` ids file at first). It writes ready SDK files. Create in this order, adding each new id to `ids.json` and rebuilding before the next:
   1. `send.ts` → `SEND_WORKFLOW_ID`
   2. `errors.ts`
   3. `brain.ts` → `BRAIN_WORKFLOW_ID`
   4. `whatsapp.ts`, `facebook.ts` (only the user's channels) and `follow-ups.ts`
   Every file passes `validate_workflow` before `create_workflow_from_code` (with the project id). A warning you cannot explain is a bug.
5. **Publish, after the user's yes.** Publish `bot · errors` first, then on every other bot workflow `update_workflow` with `setWorkflowSettings` `{ "errorWorkflow": "<errors id>" }`, then publish `send`, `brain`, the channel workflows and `follow-ups`. While `test_numbers` is filled, only those numbers get replies; everyone else gets silence.
6. **Connect.** Point the channels at the webhooks (setup.md, parts 3 and 4): `<n8n address>/webhook/whatsapp-bot` and `<n8n address>/webhook/facebook-bot`. Meta checks the URL at once, so `bot · facebook` must already be published.
7. **Test.** From the test phone (not the shop's own number: those messages count as the owner typing), run 10 real customer questions, an order to the end, a voice note and «I want a human». Count correct replies. Read failed runs with `search_workflow_executions`. Then the user empties `test_numbers` to go live.
8. **Watch.** After the first 50 real chats, count `bot_messages` rows by `guard` and fix the biggest count first, usually a missing fact in `bot_settings` or `bot_products`.

## Rules when you change anything
- **Money comes from `bot_products`, in `code/apply-guards.js`.** The model never writes a total; an option must be one the shop listed.
- **"Confirmed" only through intent `confirm` while `summary_shown` is true**, which is only right after the bot showed the summary.
- **A price the shop never wrote is not sent**, and the owner gets an alert.
- **Order, chat state, owner alert, then the reply.** A failed reply must never lose an order. Keep that order in `brain.ts`.
- **Every message the bot sends is saved before it is sent** (replies, alerts, follow-ups). The echo check depends on it.
- **Code nodes cannot `require('crypto')`** in n8n. Use the Crypto node, as `facebook.ts` does.
- **Logic lives in `code/*.js`.** Edit there, run `node --test $SKILL_DIR/test/*.test.mjs` when you can, rebuild. Never edit the built files by hand.
- **Table names are part of the contract.** The templates find tables by name.
- **One bot per number.** If another bot answers the same number, switch it off in the same minute you go live.
- **Older n8n:** the templates were tested on n8n 2.35. If a node version is refused, check it with `get_node_types` and use the version the instance offers.
