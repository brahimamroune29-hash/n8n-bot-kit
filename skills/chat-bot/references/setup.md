# Setup the user does by hand

Walk the user through these in their language, one part at a time. They type every key into n8n, never into the chat.

## 1. Connect n8n to Claude
1. n8n → Settings → **Instance-level MCP** → **Enable MCP access** (owner or admin only).
2. **Connect a client** → Claude Code → copy the command shown and run it in a terminal. With the API key tab instead:
   `claude mcp add --transport http n8n <server URL ending in /mcp-server/http> --header "Authorization: Bearer <token>"`
3. Restart Claude Code; `/mcp` lists `n8n` as connected.

WhatsApp and Facebook must be able to reach the n8n address; with n8n Cloud they can.

## 2. Credentials
n8n → Credentials → Add credential. Use these names exactly: the templates look them up by name.

| Name | n8n credential type | Value | Needed for |
|---|---|---|---|
| `OpenRouter` | OpenRouter | API key from openrouter.ai | always |
| `Wasender API` | Bearer Auth | the session's API key in Wasender | WhatsApp, owner alerts |
| `Wasender webhook secret` | Header Auth | Name `X-Webhook-Signature`, Value = the webhook secret shown in Wasender | WhatsApp |
| `OpenAI` | OpenAI | API key from platform.openai.com | voice notes |
| `Facebook Page token` | Bearer Auth | the Page access token (step 4) | Instagram, Messenger |
| `Meta app secret` | Crypto | Hmac Secret = the app secret (step 4) | Instagram, Messenger |

No voice notes wanted: skip `OpenAI`; voice messages then get «write your message please».

## 3. WhatsApp (Wasender)
1. wasenderapi.com → create a session → scan the QR code with the shop's WhatsApp.
2. Session settings → Webhook URL: `<n8n address>/webhook/whatsapp-bot`, event `messages.upsert` on. Copy the webhook secret and the API key into the two Wasender credentials.
3. Owner alerts are sent through the same session to `owner_phone`.

## 4. Instagram and Messenger (Facebook Page)
Before: a Facebook Page the user manages, an Instagram professional account linked to that Page, and in the Instagram app: Settings → Messages → Connected tools → allow access to messages.

1. developers.facebook.com → My apps → Create app, use case «Engage with customers on Messenger», then add the Instagram product.
2. App settings → Basic: privacy policy URL (any public page of the shop's policy), category, icon. Copy the **App secret** → credential `Meta app secret`.
3. Messenger settings → link the Page → **Generate token** → credential `Facebook Page token`. The access token debugger should say it never expires.
4. Messenger settings → Webhooks: callback URL `<n8n address>/webhook/facebook-bot`, verify token = `bot_settings.meta_verify_token`. The `bot · facebook` workflow must be published for Meta's check to pass. Subscribe the Page to `messages` and `message_echoes`.
5. Instagram settings in the same app: add the account, same callback URL, subscribe to `messages`.
6. Permissions: `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`, `business_management`. Switch the app to Live.

**Does it need Meta's app review?** Have someone with no role in the app send «hello» to the Page on Messenger and on Instagram. The bot answers them → done. It answers only the user's own account → Meta asks for business verification and app review (a short screen recording of a message arriving and the bot replying).

Meta's limits the bot already respects: no message 24 h after the customer's last one (follow-ups there stop at 23 h); one text up to 1000 characters per message.
