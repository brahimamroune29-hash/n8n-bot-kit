# Data tables

Create them with `create_data_table`, names and columns exactly as below. n8n adds `id`, `createdAt` and `updatedAt` itself.

| Table | Columns (type) |
|---|---|
| `bot_settings` | `key` (string), `value` (string) |
| `bot_products` | `name` (string), `price` (number), `options` (string), `in_stock` (boolean), `notes` (string) |
| `bot_chats` | `chat_id` (string), `channel` (string), `name` (string), `human_until` (date), `pending_order` (string), `summary_shown` (boolean), `last_customer_at` (date), `follow_at` (date), `follow_round` (number), `opted_out` (boolean) |
| `bot_messages` | `chat_id` (string), `msg_id` (string), `role` (string), `text` (string), `guard` (string) |
| `bot_orders` | `chat_id` (string), `channel` (string), `customer_name` (string), `phone` (string), `address` (string), `items` (string), `total` (number), `status` (string) |

In `bot_products`, a size or variant with its own price is its own row (`عطر عود 50 مل` 2000, `عطر عود 100 مل` 3500). `options` lists choices that share the price, as `اللون: أسود، فضي | المقاس: M، L`; the bot accepts only those values.

## `bot_settings` keys
The owner can edit any value later in n8n → Data tables, without touching a workflow.

| key | value |
|---|---|
| `bot_enabled` | `true` or `false`: the switch for the whole bot |
| `test_numbers` | while filled (numbers separated by commas), only these chats get replies; empty = live for everyone |
| `shop_name` | the name customers see |
| `about` | what the shop sells, delivery areas and delays, payment, returns. Every fact the bot may say |
| `faq` | question and answer pairs, one per line |
| `currency` | as customers write it: `دج`, `ريال`, `درهم`… |
| `delivery_fee` | a number, or empty when delivery is free |
| `tone` | the dialect and style of replies, e.g. `لهجة خليجية بسيطة، جمل قصيرة` |
| `owner_phone` | the owner's WhatsApp in international digits (`9665…`): orders, handoffs and problems go there |
| `ai_model` | an OpenRouter model id, default `anthropic/claude-haiku-5.5` |
| `timezone` | IANA name, e.g. `Asia/Riyadh`: quiet hours for follow-ups |
| `human_minutes` | minutes the bot stays quiet after the owner types in a chat, default `30` |
| `followup_1` | first nudge, about 4 h after the bot's last reply |
| `followup_2` | second and last nudge, about 20 h later |
| `meta_verify_token` | any long random text; the same goes in the Meta app's webhook settings |

## `bot_messages.role`
`customer`, `bot` or `owner`. `guard` is empty on a normal reply, otherwise the reason the code changed it: `unknown-number`, `false-confirm`, `order-incomplete`, `confirm-without-summary`, `confirm-without-order`, `handoff`, `ai-error`, `empty-reply`, `voice-failed`, `follow-up`, `alert`.

## `bot_orders.status`
The bot writes `new`. The owner changes it by hand, e.g. `shipped`, `delivered` or `cancelled`.
