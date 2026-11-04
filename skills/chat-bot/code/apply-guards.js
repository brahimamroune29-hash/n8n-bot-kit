// Code node «Apply guards»: the AI's JSON -> what the customer actually gets.
// Money is computed here from bot_products, never by the model. «Confirmed» only after a summary the
// customer saw in the bot's last reply. A price the shop never wrote is not sent.
const base = $('Read settings').first().json;
const s = base.settings;
const msg = $('Save customer message').first().json;
const chat = $('Chat state').first().json || {};
const products = $('Products').all().map((i) => i.json).filter((p) => p.name);
const history = $('History').all().map((i) => i.json);
const res = $('Ask AI').first().json || {};
const now = new Date();
const cur = String(s.currency || '').trim();
const fee = Number(s.delivery_fee || 0) || 0;
const fmt = (n) => Number(n).toLocaleString('en-US'); // 7,600: a space separator splits in right-to-left text
const latin = (t) => String(t ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const norm = (t) => latin(t).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
const SAFE = 'خليني أتأكد وأرجع لك بالمعلومة الصحيحة 🙏';

let out = null;
const content = res.choices?.[0]?.message?.content;
if (typeof content === 'string') {
  try { out = JSON.parse(content); } catch (e) {
    const j = content.match(/\{[\s\S]*\}/);
    if (j) { try { out = JSON.parse(j[0]); } catch (e2) { out = null; } }
  }
}

let pending = null;
try { pending = chat.pending_order ? JSON.parse(chat.pending_order) : null; } catch (e) { pending = null; }

const state = {
  chat_id: msg.chat_id,
  channel: base.channel,
  name: base.name || chat.name || '',
  pending_order: chat.pending_order || '',
  summary_shown: false, // true only right after the bot shows a summary
  last_customer_at: now.toISOString(),
  follow_at: new Date(now.getTime() + 4 * 3600e3).toISOString(),
  follow_round: 0,
  opted_out: chat.opted_out === true,
  human_until: chat.human_until || null,
};
// «stop messaging me» in its usual forms; a «stop» inside a question about a product is not an opt-out
if (/(توقف\S*\s+عن\s+(ال)?(رسائل|رسايل|مراسل|ارسال|إرسال)|لا\s+(ترسل|تراسل|تبعث)\S*\s+(لي\s+)?(رسائل|رسايل|مسجات)|لا\s+تراسلني|ما\s+تبعثليش|بلا\s+رسائل|^\s*((من\s+فضلك|رجاء|لو\s+سمحت)\s+)?(توقف|توقفوا|اوقف|أوقف|stop)\s*[.!]*\s*$|unsubscribe)/i.test(msg.text)) state.opted_out = true;

const result = { channel: base.channel, chat_id: msg.chat_id, owner_phone: s.owner_phone || '', reply: '', guard: '', order: null, alert: null };

const summaryOf = (o) => ['ملخص طلبك:']
  .concat(o.items.map((i) => '• ' + i.name + (i.option ? ' (' + i.option + ')' : '') + ' × ' + i.qty + ' = ' + fmt(i.price * i.qty) + ' ' + cur))
  .concat(o.fee ? ['التوصيل: ' + fmt(o.fee) + ' ' + cur] : [])
  .concat([
    'المجموع: ' + fmt(o.total) + ' ' + cur,
    'الاسم: ' + o.name + ' — الهاتف: ' + o.phone,
    'العنوان: ' + o.address,
    '',
    'نؤكد الطلب؟ اكتب «نعم»',
  ]).join('\n');

// «اللون: أسود، فضي | المقاس: M، L» -> ['أسود', 'فضي', 'M', 'L']
const optionsOf = (p) => String(p.options || '').split(/[|\n]/).flatMap((g) => g.replace(/^[^:：]*[:：]/, '').split(/[،,/]/)).map((x) => x.trim()).filter(Boolean);

const priceOrder = (o) => {
  const items = [], problems = [];
  for (const it of (o?.items || [])) {
    const want = norm(it?.product);
    // exact name, or the request is a unique part of one name («عطر عود» -> «عطر عود ملكي 100 مل»), never the reverse
    let p = products.find((x) => norm(x.name) === want);
    if (!p && want.length >= 3) {
      const c = products.filter((x) => norm(x.name).includes(want));
      if (c.length === 1) p = c[0];
      else if (c.length > 1) { problems.push('أي واحد تقصد: ' + c.map((x) => '«' + x.name + '»').join(' أو ') + '؟'); continue; }
    }
    if (!p) { problems.push('«' + String(it?.product ?? '') + '» غير موجود في منتجاتنا.'); continue; }
    if (p.in_stock === false) { problems.push('«' + p.name + '» غير متوفر حالياً.'); continue; }
    const price = Number(p.price);
    if (p.price === '' || p.price === null || !Number.isFinite(price) || price <= 0) { problems.push('سعر «' + p.name + '» غير مكتوب عندي، سأسأل صاحب المتجر.'); continue; }
    const list = optionsOf(p);
    const chosen = String(it.option || '').split(/[،,/]/).map((x) => x.trim()).filter(Boolean);
    if (list.length && !chosen.length) { problems.push('اختر لـ «' + p.name + '»: ' + list.join('، ') + '.'); continue; }
    const bad = chosen.filter((c) => !list.some((v) => norm(v) === norm(c)));
    if (list.length && bad.length) { problems.push('«' + bad.join('، ') + '» غير متوفر في «' + p.name + '». المتوفر: ' + list.join('، ') + '.'); continue; }
    items.push({ name: p.name, option: list.length ? chosen.join('، ') : '', qty: Math.max(1, Math.min(50, Math.round(Number(it.qty) || 1))), price });
  }
  if (!items.length && !problems.length) problems.push('أي منتج تريد؟');
  const need = [];
  if (!String(o?.name || '').trim()) need.push('الاسم');
  if (latin(o?.phone).replace(/\D/g, '').length < 8) need.push('رقم الهاتف');
  if (!String(o?.address || '').trim()) need.push('العنوان');
  const sum = items.reduce((a, i) => a + i.price * i.qty, 0);
  return { items, problems, need, fee: items.length ? fee : 0, total: sum + (items.length ? fee : 0),
    name: String(o?.name || '').trim(), phone: latin(o?.phone).trim(), address: String(o?.address || '').trim() };
};

// ── the number guard: a price must be one the shop wrote; other numbers must not be invented phones or codes
const clean = (t) => latin(t).replace(/(\d)[,٬](?=\d{3}\b)/g, '$1').replace(/(\d) (?=\d{3}\b)/g, '$1');
const numsIn = (t) => (clean(t).match(/\d+(?:\.\d+)?/g) || []);
const prices = new Set(), facts = new Set();
for (const p of products) {
  const v = Number(p.price);
  if (v > 0) for (let q = 1; q <= 50; q++) { prices.add(String(v * q)); prices.add(String(v * q + fee)); }
  numsIn([p.name, p.options, p.notes].join(' ')).forEach((n) => facts.add(n));
}
numsIn([s.about, s.faq, s.delivery_fee].join(' ')).forEach((n) => { prices.add(n); facts.add(n); });
if (fee) prices.add(String(fee));
if (pending?.total) prices.add(String(pending.total));
// the customer's own phone numbers may be repeated back; their haggled prices may not
history.filter((r) => r.role === 'customer').forEach((r) => numsIn(r.text).filter((n) => n.length >= 7).forEach((n) => facts.add(n)));
const CURRENCY = [cur, 'دج', 'دينار', 'ريال', 'درهم', 'جنيه', 'دولار', 'ليرة', '$', 'DA', 'DZD', 'SAR', 'AED', 'USD', 'EUR', '€'].filter(Boolean);
const foreignNumber = (t) => {
  const text = clean(t);
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text))) {
    const n = m[0];
    const after = text.slice(m.index + n.length, m.index + n.length + 8).trim();
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    const money = CURRENCY.some((c) => after.startsWith(c)) || /(بـ|ب)\s*$/.test(before) || /(سعر|السعر|بسعر|المجموع|ثمن|الثمن|=)\D{0,6}$/.test(before);
    if (money ? !prices.has(n) : (Number(n) >= 100 && !/^20\d\d$/.test(n) && !facts.has(n) && !prices.has(n))) return n;
  }
  return null;
};
const claimsDone = (t) => /(تم\s*(ال)?(تأكيد|تاكيد|تسجيل)|(تأكد|تاكد|تسجل|تسجّل|اتسجل)\s*طلبك|طلبك\s*(تأكد|تاكد|مؤكد|تسجل|تسجّل|مسجل|مسجّل|اتسجل)|(أكدنا|اكدنا|سجلنا|سجّلنا|سجلت|سجّلت)\s*(لك\s*)?(ال)?طلب)/.test(t);

if (!out || typeof out.reply !== 'string') {
  result.reply = 'عذراً، صار عندي خلل بسيط. أرجع لك في أقرب وقت 🙏';
  result.guard = 'ai-error';
  result.alert = '⚠️ البوت لم يستطع الرد على ' + msg.chat_id + ' (' + String(res.error?.message || res.error || 'رد غير مفهوم من الذكاء الاصطناعي').slice(0, 150) + '). رد عليه بنفسك.';
} else if (out.intent === 'human') {
  result.reply = 'حاضر، حوّلتك لصاحب المتجر وسيرد عليك قريباً 🙏';
  result.guard = 'handoff';
  state.human_until = new Date(now.getTime() + 24 * 3600e3).toISOString();
  state.follow_at = null;
  result.alert = '🙋 زبون يحتاجك: ' + (state.name ? state.name + ' ' : '') + msg.chat_id + '\nآخر رسالة: ' + msg.text.slice(0, 300);
} else if (out.intent === 'confirm' && pending && chat.summary_shown === true) {
  result.order = { chat_id: msg.chat_id, channel: base.channel, customer_name: pending.name, phone: pending.phone, address: pending.address,
    items: pending.items.map((i) => i.name + (i.option ? ' (' + i.option + ')' : '') + ' × ' + i.qty).join('، '), total: pending.total, status: 'new' };
  result.reply = 'تم ✅ تسجيل طلبك. المجموع ' + fmt(pending.total) + ' ' + cur + '. سنتواصل معك قريباً لتأكيد التوصيل.';
  result.alert = '🛒 طلب جديد: ' + result.order.items + '\nالمجموع: ' + fmt(pending.total) + ' ' + cur + '\n' + pending.name + ' — ' + pending.phone + '\n' + pending.address;
  state.pending_order = '';
  state.follow_at = null;
} else if (out.intent === 'confirm' && pending) {
  // a «yes» to a summary that is not the bot's last reply: show it again first
  result.reply = summaryOf(pending);
  result.guard = 'confirm-without-summary';
  state.summary_shown = true;
} else if (out.intent === 'confirm') {
  result.reply = 'ما عندي طلب مفتوح باسمك بعد. أي منتج تريد؟';
  result.guard = 'confirm-without-order';
} else if (out.intent === 'order') {
  const o = priceOrder(out.order);
  if (o.problems.length || o.need.length) {
    result.reply = o.problems.concat(o.need.length ? ['لإكمال طلبك أحتاج: ' + o.need.join('، ') + '.'] : []).join('\n');
    result.guard = 'order-incomplete';
  } else {
    result.reply = summaryOf(o);
    state.pending_order = JSON.stringify(o);
    state.summary_shown = true;
  }
} else {
  const r = out.reply.trim();
  const n = r ? foreignNumber(r) : null;
  if (!r) { result.reply = SAFE; result.guard = 'empty-reply'; }
  else if (n) {
    result.reply = SAFE;
    result.guard = 'unknown-number';
    result.alert = '⚠️ البوت كان سيذكر رقماً غير موجود في معلوماتك (' + n + ') لـ ' + msg.chat_id + ':\n' + r.slice(0, 200) + '\nرد عليه بنفسك، وأضف المعلومة في bot_settings إن كانت صحيحة.';
  } else if (claimsDone(r)) {
    result.reply = pending ? summaryOf(pending) : SAFE;
    result.guard = 'false-confirm';
    if (pending) state.summary_shown = true;
  } else result.reply = r;
}

if (state.opted_out) state.follow_at = null;
result.chat = state;
return [{ json: result }];
