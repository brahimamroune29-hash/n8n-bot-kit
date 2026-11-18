// node --test skills/chat-bot/test — plan() turns a client folder into what build-bot.mjs will create. No server is called.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { plan, unresolvedCredentials } from '../build-bot.mjs'

const ENV = {
  N8N_URL: 'https://n8n.example.com/', N8N_API_KEY: 'k',
  OPENROUTER_API_KEY: 'or', WASENDER_API_KEY: 'wa', WASENDER_WEBHOOK_SECRET: 'ws',
}
const BOT = {
  channels: ['whatsapp'],
  voice: false,
  settings: {
    shop_name: 'متجر التجربة', about: 'نبيعو عطور.', faq: '', currency: 'دج', delivery_fee: '500',
    tone: 'دارجة بسيطة', owner_phone: '+999 ٠٠٠ 00 00 01', test_numbers: '+999 000 00 00 02، 999-000-000-003',
    timezone: 'Africa/Algiers', followup_1: 'مازالك مهتم؟', followup_2: 'نخليك على راحتك',
  },
  products: [{ name: 'عطر عود 100 مل', price: 3500 }, { name: 'ساعة', price: 4800, options: 'اللون: أسود، فضي', in_stock: false, notes: 'x' }],
}
const folder = ({ env = ENV, bot = BOT, state } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'bot-'))
  writeFileSync(join(dir, '.env'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'))
  writeFileSync(join(dir, 'bot.json'), JSON.stringify(bot))
  if (state) writeFileSync(join(dir, 'state.json'), JSON.stringify(state))
  return dir
}
const BUILT = { OpenRouter: '1', 'Wasender API': '2', 'Wasender webhook secret': '3' }
const merge = (over) => ({ ...BOT, ...over, settings: { ...BOT.settings, ...over.settings } })
const problems = (opts) => { try { plan(folder(opts)) } catch (e) { return e.message } return '' }

test('WhatsApp-only shop: its keys come from .env, keys of unused channels are filled with not-used', () => {
  const p = plan(folder())
  assert.equal(p.base, 'https://n8n.example.com/api/v1')
  assert.deepEqual(p.creds, [
    ['OpenRouter', 'openRouterApi', { apiKey: 'or' }],
    ['Wasender API', 'httpBearerAuth', { token: 'wa' }],
    ['Wasender webhook secret', 'httpHeaderAuth', { name: 'X-Webhook-Signature', value: 'ws' }],
    ['OpenAI', 'openAiApi', { apiKey: 'not-used' }],
    ['Facebook Page token', 'httpBearerAuth', { token: 'not-used' }],
  ])
  assert.deepEqual(p.workflows.map(([file]) => file), ['send', 'errors', 'brain', 'whatsapp', 'follow-ups'])
  const s = Object.fromEntries(p.rows.bot_settings.map((r) => [r.key, r.value]))
  assert.equal(s.owner_phone, '999000000001')
  assert.equal(s.test_numbers, '999000000002,999000000003')
  assert.equal(s.bot_enabled, 'true')
  assert.equal(s.ai_model, 'anthropic/claude-haiku-5.5')
  assert.equal(s.human_minutes, '30')
  assert.match(s.meta_verify_token, /^[0-9a-f]{48}$/)
  assert.deepEqual(p.rows.bot_products, [
    { name: 'عطر عود 100 مل', price: 3500, options: '', in_stock: true, notes: '' },
    { name: 'ساعة', price: 4800, options: 'اللون: أسود، فضي', in_stock: false, notes: 'x' },
  ])
})

test('Instagram only, with voice: Facebook keys and workflow, no WhatsApp webhook', () => {
  const env = { ...ENV, OPENAI_API_KEY: 'oa', FACEBOOK_PAGE_TOKEN: 'fb', META_APP_SECRET: 'ms' }
  const p = plan(folder({ env, bot: merge({ channels: ['instagram'], voice: true }) }))
  assert.deepEqual(p.creds.map(([name]) => name), ['OpenRouter', 'Wasender API', 'OpenAI', 'Facebook Page token', 'Meta app secret'])
  assert.deepEqual(p.creds.at(-1), ['Meta app secret', 'crypto', { hmacSecret: 'ms' }])
  assert.deepEqual(p.creds[2], ['OpenAI', 'openAiApi', { apiKey: 'oa' }])
  assert.deepEqual(p.workflows.map(([file]) => file), ['send', 'errors', 'brain', 'facebook', 'follow-ups'])
})

test('refuses to build, naming every gap at once', () => {
  const msg = problems({
    env: { N8N_URL: 'http://localhost:5678' },
    bot: merge({ channels: ['whatsapp', 'telegram'], settings: { test_numbers: '', owner_phone: 'no digits', tone: '[أسلوب الرد]' }, products: [{ name: 'عطر', price: '3500' }] }),
  })
  for (const part of ['N8N_API_KEY', 'OPENROUTER_API_KEY', 'WASENDER_API_KEY', 'WASENDER_WEBHOOK_SECRET', 'telegram', 'test_numbers', 'owner_phone', 'tone', 'products[0].price'])
    assert.ok(msg.includes(part), `${part} missing from:\n${msg}`)
  assert.ok(!msg.includes('OPENAI_API_KEY'), 'voice is off, so the OpenAI key is not asked for')
  assert.match(problems({ bot: merge({ products: [] }) }), /products/)
  assert.match(problems({ bot: merge({ channels: [] }) }), /channels/)
})

test('a credential already created is not asked for again', () => {
  const state = { base: 'http://localhost:5678/api/v1', creds: BUILT, tables: {}, ids: {} }
  const p = plan(folder({ env: { N8N_URL: 'http://localhost:5678', N8N_API_KEY: 'k' }, state }))
  assert.equal(p.state.creds.OpenRouter, '1')
})

test('a workflow that still holds newCredential() names the missing credential', () => {
  const code = "import { newCredential } from '@n8n/workflow-sdk';\ncredentials: { crypto: newCredential('Meta app secret') }"
  assert.deepEqual(unresolvedCredentials(code), ['Meta app secret'])
  assert.deepEqual(unresolvedCredentials("credentials: { crypto: { id: '1', name: 'Meta app secret' } }"), [])
})

test('refuses values that look filled but would build a wrong bot', () => {
  const cases = [
    [{ settings: { test_numbers: '0990000003' } }, 'settings.test_numbers'],
    [{ settings: { test_numbers: '999000000002 999000000003' } }, 'settings.test_numbers'],
    [{ settings: { owner_phone: '999000000001 / 999000000009' } }, 'settings.owner_phone'],
    [{ settings: { about: 'نبيعو [المنتجات] والتوصيل في يومين' } }, 'settings.about'],
    [{ settings: { timezone: 'Riyadh' } }, 'settings.timezone'],
    [{ settings: { human_minutes: '30 دقيقة' } }, 'settings.human_minutes'],
    [{ settings: { deliveryFee: '500' } }, 'settings.deliveryFee'],
    [{ settings: { faq: ['سؤال'] } }, 'settings.faq'],
    [{ voice: 'true' }, 'voice'],
    [{ products: [{ name: 'عطر', price: 0 }] }, 'products[0].price'],
    [{ products: [{ name: 'عطر', price: 3500, options: '[الخيارات]' }] }, 'products[0].options'],
    [{ products: [{ name: 'عطر', price: 3500, options: { color: ['أسود'] } }] }, 'products[0].options'],
  ]
  for (const [over, part] of cases) assert.ok(problems({ bot: merge(over) }).includes(part), `${part} was accepted`)
})

test('an address or a key that would be echoed in an error is refused without being printed', () => {
  const url = problems({ env: { ...ENV, N8N_URL: 'https://admin:PASSWORD@n8n.example.com' } })
  assert.match(url, /N8N_URL/)
  assert.ok(!url.includes('PASSWORD'))
  const key = problems({ env: { ...ENV, N8N_API_KEY: 'SECRET KEY' } })
  assert.match(key, /N8N_API_KEY/)
  assert.ok(!key.includes('SECRET'))
})

test('a folder copied from another client is refused: its state.json belongs to another n8n', () => {
  const state = { base: 'https://other.example.com/api/v1', creds: BUILT, tables: { bot_settings: 't' }, ids: {} }
  assert.match(problems({ state }), /state\.json/)
})

test('a channel added later: its key in .env replaces not-used, and without the key it is refused', () => {
  const state = { base: 'https://n8n.example.com/api/v1', creds: { ...BUILT, OpenAI: '4', 'Facebook Page token': '5' }, unused: { OpenAI: true, 'Facebook Page token': true }, tables: {}, ids: {} }
  const bot = merge({ channels: ['whatsapp', 'instagram'] })
  const p = plan(folder({ env: { ...ENV, FACEBOOK_PAGE_TOKEN: 'fb', META_APP_SECRET: 'ms' }, state, bot }))
  assert.deepEqual(p.creds.find(([name]) => name === 'Facebook Page token'), ['Facebook Page token', 'httpBearerAuth', { token: 'fb' }])
  const msg = problems({ env: { ...ENV, META_APP_SECRET: 'ms' }, state, bot })
  assert.ok(msg.includes('FACEBOOK_PAGE_TOKEN'), msg)
  assert.ok(!msg.includes('OPENAI_API_KEY'), 'voice is still off')
})

test('.env: a key left as a [placeholder] counts as empty, and an address ending in /api/v1 is not doubled', () => {
  assert.match(problems({ env: { ...ENV, OPENROUTER_API_KEY: '[your key]' } }), /OPENROUTER_API_KEY/)
  assert.equal(plan(folder({ env: { ...ENV, N8N_URL: 'https://n8n.example.com/api/v1/' } })).base, 'https://n8n.example.com/api/v1')
})
