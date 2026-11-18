#!/usr/bin/env node
// node build-bot.mjs <client-folder>
// Builds the bot in the client's n8n through its public API, for when the n8n MCP server is not connected:
// the credentials, the 5 data tables with the shop's rows, then the workflows, all unpublished. Prints no secret.
//
// The client folder holds two files:
//   .env      N8N_URL, N8N_API_KEY, OPENROUTER_API_KEY, WASENDER_API_KEY, and for the client's channels:
//             WASENDER_WEBHOOK_SECRET (whatsapp) · FACEBOOK_PAGE_TOKEN, META_APP_SECRET (instagram, messenger) · OPENAI_API_KEY (voice)
//   bot.json  { "channels": ["whatsapp", "instagram", "messenger"], "voice": false,
//               "settings": { the bot_settings keys of references/tables.md, without bot_enabled and
//                             meta_verify_token, which this script sets }, "products": [ bot_products rows ] }
// and receives state.json, creds.json, ids.json and n8n/ (ids and built files).
// The owner fills .env by hand: never in chat, never in git. It is the one place the keys live outside n8n.
// Needs n8n installed on this machine (npm install -g n8n): its SDK turns the templates into workflows.
// One folder per client, never a copy of another client's folder: state.json belongs to one n8n.
//
// ponytail: safe to run again (whatever state.json lists is skipped), but it never updates what exists.
// - A row or a credential: change it in n8n. The one exception: a credential created holding 'not-used'
//   gets its real value from .env on the run after its channel, or voice, is turned on in bot.json.
// - Workflows hold each other's ids, so they are rebuilt together: delete all the bot's workflows in n8n
//   and the "wf" and "ids" objects in state.json, then run again.
// - A run cut between n8n's answer and the write of state.json leaves one object n8n has and state.json
//   does not: delete that object in n8n, then run again.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const NOT_USED = 'not-used'
const CHANNELS = ['whatsapp', 'instagram', 'messenger']
const OPTIONAL = ['faq', 'delivery_fee', 'ai_model', 'human_minutes']
const REQUIRED = ['shop_name', 'about', 'currency', 'tone', 'owner_phone', 'test_numbers', 'timezone', 'followup_1', 'followup_2']
const TABLES = {
  bot_settings: [['key', 'string'], ['value', 'string']],
  bot_products: [['name', 'string'], ['price', 'number'], ['options', 'string'], ['in_stock', 'boolean'], ['notes', 'string']],
  bot_chats: [['chat_id', 'string'], ['channel', 'string'], ['name', 'string'], ['human_until', 'date'], ['pending_order', 'string'], ['summary_shown', 'boolean'], ['last_customer_at', 'date'], ['follow_at', 'date'], ['follow_round', 'number'], ['opted_out', 'boolean']],
  bot_messages: [['chat_id', 'string'], ['msg_id', 'string'], ['role', 'string'], ['text', 'string'], ['guard', 'string']],
  bot_orders: [['chat_id', 'string'], ['channel', 'string'], ['customer_name', 'string'], ['phone', 'string'], ['address', 'string'], ['items', 'string'], ['total', 'number'], ['status', 'string']],
}

const text = (v) => String(v ?? '').trim()
// «+999 ٠٠٠ 00 00 01» -> 999000000001. Arabic and Persian digits end in the same 4 bits as their ASCII digit.
const digits = (v) => text(v).replace(/[٠-٩۰-۹]/g, (d) => d.charCodeAt(0) & 15).replace(/\D/g, '')
// The form chat ids have: country code first, no leading 0. Messenger and Instagram ids are longer than phones.
const international = (n, max) => n.length >= 10 && n.length <= max && n[0] !== '0'
const placeholder = (v) => /\[[^\]]*\]/.test(text(v)) // a «[price]» left over from the interview sheet, anywhere in the text
const scalar = (v) => v == null || typeof v === 'string' || typeof v === 'number'

// Reads the client folder and returns everything main() will create, or throws one error that names every gap.
// Nothing is sent anywhere: a folder that is not ready costs no half-built bot. No message quotes a value of .env.
export function plan(dir) {
  const read = (f) => readFileSync(join(dir, f), 'utf8')
  if (!existsSync(join(dir, 'bot.json'))) throw new Error(`${dir}: bot.json not found (its shape is at the top of build-bot.mjs)`)
  const env = existsSync(join(dir, '.env')) ? parseEnv(read('.env')) : {}
  const bot = JSON.parse(read('bot.json'))
  const state = { creds: {}, unused: {}, tables: {}, rows: {}, ids: {}, wf: {}, ...(existsSync(join(dir, 'state.json')) ? JSON.parse(read('state.json')) : {}) }
  const gaps = []
  const check = (where, value, { required } = {}) => {
    if (!scalar(value)) gaps.push(`${where}: must be text`)
    else if (placeholder(value)) gaps.push(`${where}: holds text in [brackets]. Fill the placeholder, or write it without the brackets`)
    else if (required && !text(value)) gaps.push(`${where}: empty`)
  }

  const address = text(env.N8N_URL).replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  let url; try { url = new URL(address) } catch {}
  if (!url || !/^https?:$/.test(url.protocol)) gaps.push('.env N8N_URL: the address of the client\'s n8n, starting with http:// or https://')
  else if (url.username || url.password) gaps.push('.env N8N_URL: take the user and password out of the address')
  const base = address + '/api/v1'
  const key = text(env.N8N_API_KEY)
  if (!key) gaps.push('.env N8N_API_KEY: empty (n8n → Settings → n8n API)')
  else if (/\s/.test(key)) gaps.push('.env N8N_API_KEY: has a space or a line break inside')
  if (state.base && state.base !== base) gaps.push(`state.json: this folder was built on another n8n (${state.base}). A copy of another client's folder? Delete state.json, creds.json, ids.json and n8n/ here to build on the address in .env, and check that every key in .env is this client's own`)

  const channels = Array.isArray(bot.channels) ? bot.channels : []
  if (!channels.length) gaps.push(`bot.json channels: list at least one of ${CHANNELS.join(', ')}`)
  for (const c of channels) if (!CHANNELS.includes(c)) gaps.push(`bot.json channels: "${c}" is not one of ${CHANNELS.join(', ')}`)
  const wa = channels.includes('whatsapp')
  const fb = channels.includes('instagram') || channels.includes('messenger')
  if (typeof bot.voice !== 'boolean') gaps.push('bot.json voice: true or false, without quotes')

  // Last column — true: the client uses it, the value must be in .env · false: a workflow we build still points at it,
  // so it is created holding NOT_USED · null: nothing we build points at it, so it is not created.
  const creds = []
  for (const [name, type, envName, data, used] of [
    ['OpenRouter', 'openRouterApi', 'OPENROUTER_API_KEY', (v) => ({ apiKey: v }), true],
    ['Wasender API', 'httpBearerAuth', 'WASENDER_API_KEY', (v) => ({ token: v }), true], // owner alerts go through WhatsApp on every channel
    ['Wasender webhook secret', 'httpHeaderAuth', 'WASENDER_WEBHOOK_SECRET', (v) => ({ name: 'X-Webhook-Signature', value: v }), wa || null],
    ['OpenAI', 'openAiApi', 'OPENAI_API_KEY', (v) => ({ apiKey: v }), bot.voice === true], // brain.ts points at it
    ['Facebook Page token', 'httpBearerAuth', 'FACEBOOK_PAGE_TOKEN', (v) => ({ token: v }), fb], // send.ts points at it
    ['Meta app secret', 'crypto', 'META_APP_SECRET', (v) => ({ hmacSecret: v }), fb || null],
  ]) {
    if (used === null) continue
    const value = /^\[.*\]$/.test(text(env[envName])) ? '' : text(env[envName]) // «[your key]» is not a key
    // Asked for when the credential does not exist yet, or exists holding NOT_USED and its channel is on now.
    if (used && !value && (!state.creds[name] || state.unused[name])) gaps.push(`.env ${envName}: empty (it becomes the n8n credential «${name}»)`)
    creds.push([name, type, data(used ? value : NOT_USED)])
  }

  const s = bot.settings ?? {}
  for (const [k, v] of Object.entries(s)) {
    if (REQUIRED.includes(k) || OPTIONAL.includes(k)) check(`bot.json settings.${k}`, v)
    else gaps.push(`bot.json settings.${k}: not a key bot.json takes. They are ${[...REQUIRED, ...OPTIONAL].join(', ')}`)
  }
  const testNumbers = text(s.test_numbers).split(/[,،;/\n]+/).map(digits).filter(Boolean) // a space may sit inside one number
  const settings = {
    bot_enabled: 'true',
    test_numbers: testNumbers.join(','),
    shop_name: text(s.shop_name),
    about: text(s.about),
    faq: text(s.faq),
    currency: text(s.currency),
    delivery_fee: text(s.delivery_fee),
    tone: text(s.tone),
    owner_phone: digits(s.owner_phone),
    ai_model: text(s.ai_model) || 'anthropic/claude-haiku-5.5',
    timezone: text(s.timezone),
    human_minutes: text(s.human_minutes) || '30',
    followup_1: text(s.followup_1),
    followup_2: text(s.followup_2),
    meta_verify_token: randomBytes(24).toString('hex'),
  }
  for (const k of REQUIRED) if (!settings[k]) gaps.push(`bot.json settings.${k}: empty${k === 'test_numbers' ? ' (an empty test_numbers means the bot answers everyone)' : ''}`)
  if (testNumbers.some((n) => !international(n, 20))) gaps.push('bot.json settings.test_numbers: international digits (country code first, no 0 in front), with a comma between two numbers')
  if (settings.owner_phone && !international(settings.owner_phone, 15)) gaps.push('bot.json settings.owner_phone: one number in international digits (country code first, no 0 in front)')
  if (settings.delivery_fee && !(Number(settings.delivery_fee) >= 0)) gaps.push('bot.json settings.delivery_fee: a number, or empty when delivery is free')
  if (!(Number(settings.human_minutes) > 0)) gaps.push('bot.json settings.human_minutes: a number of minutes, like 30')
  if (settings.timezone) try { new Intl.DateTimeFormat('en', { timeZone: settings.timezone }) } catch { gaps.push('bot.json settings.timezone: an IANA name like Africa/Algiers') }

  const products = (Array.isArray(bot.products) ? bot.products : []).map((p, i) => {
    const at = `bot.json products[${i}]`
    check(`${at}.name`, p?.name, { required: true })
    check(`${at}.options`, p?.options)
    check(`${at}.notes`, p?.notes)
    if (typeof p?.price !== 'number' || !(p.price > 0)) gaps.push(`${at}.price: must be a number above 0, without quotes`)
    if (p?.in_stock !== undefined && typeof p.in_stock !== 'boolean') gaps.push(`${at}.in_stock: true or false`)
    return { name: text(p?.name), price: p?.price, options: text(p?.options), in_stock: p?.in_stock ?? true, notes: text(p?.notes) }
  })
  if (!products.length) gaps.push('bot.json products: list at least one product')

  if (gaps.length) throw new Error(`${dir} is not ready, nothing was built:\n- ${gaps.join('\n- ')}`)
  return {
    base,
    key,
    creds,
    rows: { bot_settings: Object.entries(settings).map(([key, value]) => ({ key, value })), bot_products: products },
    workflows: [['send', 'SEND_WORKFLOW_ID'], ['errors'], ['brain', 'BRAIN_WORKFLOW_ID'], ...(wa ? [['whatsapp']] : []), ...(fb ? [['facebook']] : []), ['follow-ups']],
    state,
  }
}

// build.mjs leaves newCredential('<Name>') in place when it has no id for it, and the SDK then drops the
// credential from the node without a word. Name them instead.
export const unresolvedCredentials = (code) => [...code.matchAll(/newCredential\('([^']+)'\)/g)].map((m) => m[1])

async function main(dir) {
  const { base, key, creds, rows, workflows, state } = plan(dir)
  let parseWorkflowCode, validateWorkflow
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    ;({ parseWorkflowCode, validateWorkflow } = createRequire(join(root, 'n8n', 'package.json'))('@n8n/workflow-sdk'))
  } catch {
    throw new Error('n8n must be installed on this machine (npm install -g n8n): its @n8n/workflow-sdk turns the templates into workflows')
  }
  const file = (f) => join(dir, f)
  const save = () => writeFileSync(file('state.json'), JSON.stringify(state, null, 2))
  const api = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text()
    let j; try { j = JSON.parse(t) } catch { j = { raw: t.slice(0, 300) } }
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 400)}`)
    return j
  }

  // Before any secret leaves this machine. The templates find the tables by name, so one n8n holds one bot:
  // tables that are there and that this folder did not create mean the wrong address, or a second bot.
  if (!Object.keys(state.tables).length) {
    const taken = []
    let cursor = ''
    do {
      const page = await api('GET', '/data-tables?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))
      taken.push(...(page.data ?? []).map((t) => t.name).filter((n) => n in TABLES))
      cursor = page.nextCursor
    } while (cursor)
    if (taken.length) throw new Error(`this n8n already holds a bot that this folder did not build (tables ${taken.join(', ')}). Is N8N_URL in .env the right client? Nothing was created.`)
  }
  state.base = base; save()

  for (const [name, type, data] of creds) {
    const unused = Object.values(data).includes(NOT_USED)
    if (!state.creds[name]) {
      state.creds[name] = (await api('POST', '/credentials', { name, type, data })).id
      if (unused) state.unused[name] = true
      save(); console.log('credential:', name)
    } else if (state.unused[name] && !unused) {
      await api('PATCH', `/credentials/${state.creds[name]}`, { data })
      delete state.unused[name]
      save(); console.log('credential, now holding its real value:', name)
    }
  }

  for (const [name, cols] of Object.entries(TABLES)) {
    if (!state.tables[name]) {
      const t = await api('POST', '/data-tables', { name, columns: cols.map(([n, type]) => ({ name: n, type })) })
      state.tables[name] = t.id ?? t.data?.id
      save(); console.log('table:', name)
    }
    // Marked only once the rows are in: a table left empty by a failed run is filled on the next one.
    if (rows[name] && !state.rows[name]) {
      await api('POST', `/data-tables/${state.tables[name]}/rows`, { data: rows[name], returnType: 'count' })
      state.rows[name] = rows[name].length
      save(); console.log('  rows:', rows[name].length)
    }
  }

  mkdirSync(file('n8n'), { recursive: true })
  writeFileSync(file('creds.json'), JSON.stringify(state.creds))
  const build = () => {
    writeFileSync(file('ids.json'), JSON.stringify(state.ids))
    execFileSync('node', [join(here, 'build.mjs'), file('n8n'), '--creds', file('creds.json'), '--ids', file('ids.json')], { stdio: 'pipe' })
  }
  build()
  for (const [name] of workflows) { // every credential first, so that a gap stops the run before the first workflow exists
    const missing = unresolvedCredentials(readFileSync(file(`n8n/${name}.ts`), 'utf8'))
    if (missing.length) throw new Error(`${name}.ts: no credential id for ${missing.join(', ')}. Create it in n8n, add its id under "creds" in state.json, run again. No workflow was created in this run.`)
  }
  for (const [name, idKey] of workflows) {
    if (state.wf[name]) continue
    build() // again: the workflows created so far gave their ids
    const code = readFileSync(file(`n8n/${name}.ts`), 'utf8')
    const noId = code.match(/\b[A-Z]+_WORKFLOW_ID\b/)
    if (noId) throw new Error(`${name}.ts: ${noId[0]} has no id in state.json. Rebuild the workflows together (see the top of build-bot.mjs).`)
    const wf = parseWorkflowCode(code.replace(/^import .*\n/gm, ''))
    const { errors, warnings } = validateWorkflow(wf) // the same gate as validate_workflow on the MCP path: a warning is a bug too
    if (errors.length || warnings.length) throw new Error(`${name}.ts does not pass validation:\n- ${[...errors, ...warnings].map((e) => e.message).join('\n- ')}`)
    const made = await api('POST', '/workflows', { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: 'v1' } })
    state.wf[name] = made.id
    if (idKey) state.ids[idKey] = made.id
    save(); console.log('workflow:', wf.name, `(${wf.nodes.length} nodes)`)
  }
  console.log(`done. workflows: ${Object.keys(state.wf).length} | tables: ${Object.keys(state.tables).length} | credentials: ${Object.keys(state.creds).length}`)
  console.log('Nothing is published. Next: SKILL.md from step 5, after the owner says yes.')
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('usage: node build-bot.mjs <client-folder>'); process.exit(1) }
  main(resolve(process.argv[2])).catch((e) => { console.error(e.message); process.exit(1) })
}
