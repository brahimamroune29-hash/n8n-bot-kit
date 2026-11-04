// node --test skills/chat-bot/test — runs each Code-node body with fake $input / $() like n8n does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const body = (name) => readFileSync(new URL(`../code/${name}.js`, import.meta.url), 'utf8')
const items = (arr) => arr.map((json) => ({ json }))
const run = (name, { input = [], nodes = {} } = {}) => {
  const $input = { all: () => items(input), first: () => items(input)[0] }
  const $ = (n) => {
    if (!(n in nodes)) throw new Error('unknown node ' + n)
    const list = items(nodes[n])
    return { all: () => list, first: () => list[0] ?? { json: {} } }
  }
  return new Function('$input', '$', body(name))($input, $).map((i) => i.json)
}

const settings = {
  bot_enabled: 'true', shop_name: 'متجر التجربة', currency: 'دج', delivery_fee: '600', owner_phone: '999000000009',
  about: 'التوصيل في 2 إلى 4 أيام.', faq: '', tone: '', ai_model: 'm',
}
const products = [
  { name: 'عطر عود ملكي 100 مل', price: 3500, options: '', in_stock: true },
  { name: 'حقيبة يد نسائية', price: 5200, options: 'أسود، بني', in_stock: false },
  { name: 'ساعة كلاسيك', price: 4800, options: 'اللون: أسود، فضي', in_stock: true },
  { name: 'عطر', price: 1500, options: '', in_stock: true },
  { name: 'شال', price: '', options: '', in_stock: true },
]
const ai = (o) => ({ choices: [{ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }] })
const guards = (aiOut, { chat = {}, text = 'سلام', history = [] } = {}) => run('apply-guards', {
  input: [{ id: 1 }],
  nodes: {
    'Ask AI': [aiOut],
    'Read settings': [{ channel: 'wa', name: 'أمين', settings }],
    'Save customer message': [{ chat_id: '999000000001', msg_id: 'm1', text }],
    'Chat state': [chat],
    Products: products,
    History: history.concat([{ role: 'customer', text }]),
  },
})[0]
const order = { items: [{ product: 'عطر عود ملكي', qty: 2, price: 1 }], total: 5, name: 'أمين', phone: '0123456789', address: 'وهران' }

test('the total comes from the products table, not from the model', () => {
  const r = guards(ai({ intent: 'order', reply: 'المجموع 100 دج', order }))
  assert.match(r.reply, /المجموع: 7,600 دج/)
  assert.doesNotMatch(r.reply, /100 دج/)
  assert.equal(JSON.parse(r.chat.pending_order).total, 7600)
  assert.equal(r.chat.summary_shown, true)
})

test('«yes» confirms only the summary shown in the bot’s last reply', () => {
  const pending = JSON.stringify({ items: [{ name: 'عطر عود ملكي 100 مل', option: '', qty: 2, price: 3500 }], fee: 600, total: 7600, name: 'أمين', phone: '0123456789', address: 'وهران' })
  const yes = guards(ai({ intent: 'confirm', reply: 'تم' }), { chat: { pending_order: pending, summary_shown: true }, text: 'نعم' })
  assert.equal(yes.order.total, 7600)
  assert.equal(yes.chat.pending_order, '')
  assert.match(yes.alert, /طلب جديد/)
  const stale = guards(ai({ intent: 'confirm', reply: 'تم' }), { chat: { pending_order: pending, summary_shown: false }, text: 'نعم' })
  assert.equal(stale.order, null)
  assert.equal(stale.guard, 'confirm-without-summary')
  assert.match(stale.reply, /ملخص طلبك/)
})

test('a chat reply turns summary_shown off, so a later «yes» cannot confirm', () => {
  const r = guards(ai({ intent: 'chat', reply: 'العطر ثابت بزاف' }), { chat: { pending_order: '{"total":7600}', summary_shown: true } })
  assert.equal(r.chat.summary_shown, false)
  assert.equal(r.chat.pending_order, '{"total":7600}')
})

test('a number the shop never wrote is not sent, and the owner hears about it', () => {
  const r = guards(ai({ intent: 'chat', reply: 'اليوم العطر بـ 999 دج فقط' }))
  assert.equal(r.guard, 'unknown-number')
  assert.doesNotMatch(r.reply, /999/)
  assert.match(r.alert, /999/)
  assert.equal(guards(ai({ intent: 'chat', reply: 'العطر بـ 3,500 دج' })).guard, '')
  assert.equal(guards(ai({ intent: 'chat', reply: 'يوصلك في ٤ أيام' })).guard, '')
})

test('the model cannot claim an order is confirmed', () => {
  const r = guards(ai({ intent: 'chat', reply: 'تم تأكيد طلبك!' }))
  assert.equal(r.guard, 'false-confirm')
  assert.doesNotMatch(r.reply, /تأكيد/)
})

test('unknown or out-of-stock products and missing details never produce a summary', () => {
  const r = guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'حقيبة يد نسائية', qty: 1 }], phone: '' } }))
  assert.equal(r.guard, 'order-incomplete')
  assert.match(r.reply, /غير متوفر/)
  assert.match(r.reply, /رقم الهاتف/)
  assert.equal(r.chat.summary_shown, false)
})

test('a broken AI answer gets a safe line and an owner alert', () => {
  for (const bad of [{ error: { message: 'timeout' } }, ai('not json'), ai({ intent: 'chat' })]) {
    const r = guards(bad)
    assert.equal(r.guard, 'ai-error')
    assert.ok(r.alert)
  }
  assert.equal(guards(ai('هذا ردي: {"intent":"chat","reply":"أهلا"}')).reply, 'أهلا')
})

test('handoff pauses the bot for 24 h and stops follow-ups', () => {
  const r = guards(ai({ intent: 'human', reply: 'x' }))
  assert.equal(r.guard, 'handoff')
  assert.ok(new Date(r.chat.human_until) - Date.now() > 23 * 3600e3)
  assert.equal(r.chat.follow_at, null)
})

test('opt-out words stop follow-ups', () => {
  const r = guards(ai({ intent: 'chat', reply: 'حاضر' }), { text: 'من فضلك توقف' })
  assert.equal(r.chat.opted_out, true)
  assert.equal(r.chat.follow_at, null)
})

test('build-request stops when the bot is off or a human has the chat', () => {
  const nodes = (s, chat = {}, chat_id = '999000000001') => ({ 'Read settings': [{ settings: { ...settings, ...s } }], 'Save customer message': [{ chat_id }], 'Chat state': [chat], Products: products, History: [] })
  assert.equal(run('build-request', { nodes: nodes({ bot_enabled: 'false' }) })[0].go, false)
  assert.equal(run('build-request', { nodes: nodes({}, { human_until: new Date(Date.now() + 60e3).toISOString() }) })[0].go, false)
  const r = run('build-request', { nodes: { ...nodes({}), History: [{ role: 'customer', text: 'ثاني' }, { role: 'bot', text: 'أول' }] } })[0]
  assert.equal(r.go, true)
  assert.deepEqual(r.request.messages.slice(1).map((m) => m.role), ['assistant', 'user'])
  assert.match(r.request.messages[0].content, /3500 دج/)
})

test('read-whatsapp keeps private chats only, skips old replays, flags our own sends', () => {
  const now = Math.floor(Date.now() / 1000)
  const msg = (key, extra = {}) => ({ key: { id: 'X' + Math.random(), ...key }, messageTimestamp: now, message: { conversation: 'سلام' }, pushName: 'أمين', ...extra })
  const out = run('read-whatsapp', { input: [{ body: { event: 'messages.upsert', data: { messages: [
    msg({ remoteJid: '999000000001@s.whatsapp.net' }),
    msg({ remoteJid: '123@g.us' }),
    msg({ remoteJid: '999000000112@s.whatsapp.net' }, { messageTimestamp: now - 3600 }),
    msg({ remoteJid: '999000000113@s.whatsapp.net', fromMe: true }),
    msg({ remoteJid: '999000000114@s.whatsapp.net' }, { message: { audioMessage: { seconds: 3 } } }),
  ] } } }] })
  assert.deepEqual(out.map((o) => [o.chat_id, o.from_me, o.kind]), [
    ['999000000001', false, 'text'], ['999000000113', true, 'text'], ['999000000114', false, 'voice'],
  ])
  assert.ok(out[2].media.message.audioMessage)
})

test('read-facebook: echoes are ours, only Meta CDN audio is downloaded', () => {
  const ev = (m, extra = {}) => ({ sender: { id: '111' }, recipient: { id: '999' }, timestamp: Date.now(), message: { mid: 'm' + Math.random(), ...m }, ...extra })
  const out = run('read-facebook', { input: [{ body: { object: 'instagram', entry: [{ messaging: [
    ev({ text: 'سلام' }),
    ev({ text: 'ردنا', is_echo: true }, { sender: { id: '999' }, recipient: { id: '111' } }),
    ev({ attachments: [{ type: 'audio', payload: { url: 'https://cdn.fbsbx.com/a.mp4' } }] }),
    ev({ attachments: [{ type: 'audio', payload: { url: 'https://evil.example/a.mp4' } }] }),
  ] }] } }] })
  assert.deepEqual(out.map((o) => [o.chat_id, o.from_me, o.kind]), [['ig:111', false, 'text'], ['ig:111', true, 'text'], ['ig:111', false, 'voice']])
})

test('pick-follow-ups: two nudges at most, quiet hours, opt-out, human, 24 h window', () => {
  const hourNow = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date()))
  const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString()
  const chats = [
    { chat_id: '1', channel: 'wa', follow_at: iso(-1), follow_round: 0, last_customer_at: iso(-5) },
    { chat_id: '2', channel: 'wa', follow_at: iso(-1), follow_round: 1, last_customer_at: iso(-25) },
    { chat_id: '3', channel: 'wa', follow_at: iso(-1), follow_round: 2 },
    { chat_id: '4', channel: 'wa', follow_at: iso(-1), follow_round: 0, opted_out: true },
    { chat_id: '5', channel: 'wa', follow_at: iso(-1), follow_round: 0, human_until: iso(2) },
    { chat_id: 'ig:6', channel: 'ig', follow_at: iso(-1), follow_round: 0, last_customer_at: iso(-30) },
    { chat_id: '7', channel: 'wa', follow_at: iso(1), follow_round: 0 },
  ]
  // pick a time zone where it is 12:00 now, and one where it is 23:00
  const tzAt = (h) => 'Etc/GMT' + ((hourNow - h + 24) % 24 > 12 ? '-' + (24 - (hourNow - h + 24) % 24) : '+' + ((hourNow - h + 24) % 24))
  const pick = (tz, enabled = 'true') => run('pick-follow-ups', { input: chats, nodes: { Settings: [
    { key: 'bot_enabled', value: enabled }, { key: 'timezone', value: tz }, { key: 'followup_1', value: 'أول' }, { key: 'followup_2', value: 'ثاني' },
  ] } })
  const day = pick(tzAt(12))
  assert.deepEqual(day.map((o) => [o.chat_id, o.text, o.next_round, !!o.next_at]), [['1', 'أول', 1, true], ['2', 'ثاني', 2, false], ['ig:6', '', 1, false]])
  assert.deepEqual(pick(tzAt(23)), [])
  assert.deepEqual(pick(tzAt(12), 'false'), [])
})

test('voice-text: a failed transcription asks the customer to write', () => {
  const nodes = { 'Read settings': [{ chat_id: '1', msg_id: 'v', text: '' }] }
  assert.equal(run('voice-text', { input: [{ text: 'سلام' }], nodes })[0].text, '🎤 سلام')
  assert.equal(run('voice-text', { input: [{ error: 'x' }], nodes })[0].text, '[فويس غير مسموع]')
})

test('quantities are whole numbers from 1 to 50; a missing price is never priced at 0', () => {
  const q = (qty) => JSON.parse(guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'عطر عود ملكي', qty }] } })).chat.pending_order || 'null')
  assert.equal(q(0).items[0].qty, 1)
  assert.equal(q(999).items[0].qty, 50)
  const r = guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'شال', qty: 1 }] } }))
  assert.equal(r.guard, 'order-incomplete')
  assert.match(r.reply, /سعر/)
})

test('options must be one the shop listed, and are asked for when missing', () => {
  const pick = (option) => guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'ساعة كلاسيك', option, qty: 1 }] } }))
  assert.equal(pick('أحمر ذهبي').guard, 'order-incomplete')
  assert.match(pick('أحمر ذهبي').reply, /أسود، فضي/)
  assert.equal(pick('').guard, 'order-incomplete')
  const ok = pick('فضي')
  assert.match(ok.reply, /ساعة كلاسيك \(فضي\) × 1 = 4,800/)
})

test('a product is matched exactly or by a unique part of its name, never by a shorter name', () => {
  const r = guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'عطر الورد', qty: 1 }] } }))
  assert.equal(r.guard, 'order-incomplete')
  assert.match(r.reply, /غير موجود/)
  const exact = guards(ai({ intent: 'order', reply: '', order: { ...order, items: [{ product: 'عطر', qty: 1 }] } }))
  assert.equal(JSON.parse(exact.chat.pending_order).items[0].price, 1500)
})

test('money numbers must be the shop’s; ordinary numbers pass', () => {
  const g = (reply, opts) => guards(ai({ intent: 'chat', reply }), opts).guard
  for (const ok of ['زوج بـ 7,000 دج', '3500 + 600 = 4100 دج', 'يوصلك في 24 ساعة', 'نفتح 18:30', 'يوم 15 نوفمبر', 'موديل 2026', 'العطر بـ 3 500 دج', 'العطر بـ ٣٬٥٠٠ دج'])
    assert.equal(g(ok), '', ok)
  assert.equal(g('العطر بـ 100 دج'), 'unknown-number')
  assert.equal(g('واخا بـ 2000 دج', { text: 'خليهالي بـ 2000' }), 'unknown-number')
  assert.equal(g('اتصل بنا على 0699887766'), 'unknown-number')
  assert.equal(g('نتصل بيك على 0612345678', { history: [{ role: 'customer', text: 'رقمي 0612345678' }] }), '')
})

test('every way of claiming the order is done without one is caught', () => {
  for (const r of ['تم تسجيل طلبك', 'أكدنا طلبك', 'طلبك مسجل عندنا', 'تم تأكيد طلبك'])
    assert.equal(guards(ai({ intent: 'chat', reply: r })).guard, 'false-confirm', r)
})

test('opt-out means «stop messaging me», not any «stop» in a question', () => {
  const out = (text) => guards(ai({ intent: 'chat', reply: 'حاضر' }), { text }).chat.opted_out
  for (const t of ['المنتج متوقف؟', 'لا ترسل الطلب قبل السبت', 'وقت توقف الشحن؟']) assert.equal(out(t), false, t)
  for (const t of ['توقفوا عن الرسائل', 'لا ترسلي رسائل', 'stop', 'unsubscribe', 'ما تبعثليش']) assert.equal(out(t), true, t)
})

test('test mode: while test_numbers is set, only those chats get replies', () => {
  const nodes = (test_numbers, chat_id) => ({ 'Read settings': [{ settings: { ...settings, test_numbers } }], 'Save customer message': [{ chat_id }], 'Chat state': [{}], Products: products, History: [] })
  assert.equal(run('build-request', { nodes: nodes('+999000000001, 777', '999000000001') })[0].go, true)
  assert.equal(run('build-request', { nodes: nodes('+999000000001, 777', 'ig:777') })[0].go, true)
  assert.equal(run('build-request', { nodes: nodes('+999000000001', '999000000002') })[0].go, false)
  assert.equal(run('build-request', { nodes: nodes('', '999000000002') })[0].go, true)
})

test('is-echo: our reply coming back (whole or in pieces) is ours; anything else is the owner', () => {
  const echo = (text, bot) => run('is-echo', { input: bot.map((t) => ({ role: 'bot', text: t })), nodes: { 'Read settings': [{ text }] } })[0].echo
  assert.equal(echo('ملخص طلبك:\n• عطر', ['ملخص طلبك:\n• عطر\nالمجموع: 3,500']), true)
  assert.equal(echo('راني معاك', ['أهلا']), false)
  assert.equal(echo('راني معاك', []), false)
})

test('fit-message: Instagram/Messenger get pieces of at most 1000 characters, cut at lines', () => {
  const long = Array.from({ length: 30 }, (_, i) => 'سطر رقم ' + i + ' ' + 'x'.repeat(50)).join('\n')
  const ig = run('fit-message', { input: [{ channel: 'ig', to: 'ig:1', text: long }] })
  assert.ok(ig.length > 1 && ig.every((m) => m.text.length <= 1000))
  assert.equal(ig.map((m) => m.text).join('\n'), long)
  assert.equal(run('fit-message', { input: [{ channel: 'wa', to: '1', text: long }] }).length, 1)
})

test('error-alert: one line to the owner with the workflow, the node and the link', () => {
  const r = run('error-alert', { input: [{ key: 'owner_phone', value: '+999 000 000 009' }], nodes: { 'A bot workflow failed': [{ workflow: { name: 'bot · send' }, execution: { lastNodeExecuted: 'Send on WhatsApp', error: { message: '422' }, url: 'https://n8n/x' } }] } })
  assert.equal(r[0].to, '999000000009')
  assert.match(r[0].text, /bot · send.*Send on WhatsApp.*422/s)
  assert.deepEqual(run('error-alert', { input: [], nodes: { 'A bot workflow failed': [{}] } }), [])
})

test('a «yes» with no open order never sounds like an order was placed', () => {
  const r = guards(ai({ intent: 'confirm', reply: 'تم' }), { text: 'نعم' })
  assert.equal(r.order, null)
  assert.equal(r.guard, 'confirm-without-order')
  assert.doesNotMatch(r.reply, /^تم/)
})
