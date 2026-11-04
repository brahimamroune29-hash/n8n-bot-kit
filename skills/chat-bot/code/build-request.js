// Code node «Build AI request»: the shop's facts + the last messages -> one OpenRouter chat request.
// Stops (go=false) when the bot is switched off or a human is handling the chat.
const base = $('Read settings').first().json;
const s = base.settings;
const chat = $('Chat state').first().json || {};
const products = $('Products').all().map((i) => i.json).filter((p) => p.name);
const history = $('History').all().map((i) => i.json).filter((r) => r.text).reverse();
const now = new Date();

if (String(s.bot_enabled ?? '').trim() !== 'true') return [{ json: { go: false, reason: 'bot_enabled is not true' } }];
if (chat.human_until && new Date(chat.human_until) > now) return [{ json: { go: false, reason: 'a human is handling this chat' } }];
// test mode: while test_numbers is filled, only those chats get replies
const only = String(s.test_numbers || '').split(/[\s,،]+/).map((x) => x.replace(/^\+/, '')).filter(Boolean);
const me = String($('Save customer message').first().json.chat_id || '');
if (only.length && !only.some((n) => me === n || me.endsWith(':' + n))) return [{ json: { go: false, reason: 'test mode: not a test number' } }];

const cur = s.currency || '';
const list = products.map((p) => '- ' + p.name + ' — ' + p.price + ' ' + cur
  + (p.options ? ' — ' + p.options : '')
  + (p.in_stock === false ? ' — غير متوفر حالياً' : '')
  + (p.notes ? ' — ' + p.notes : '')).join('\n');

const system = [
  'أنت مساعد المبيعات في «' + (s.shop_name || 'المتجر') + '» على الرسائل.',
  'الأسلوب: ' + (s.tone || 'عربية بسيطة، جمل قصيرة، ودود.'),
  '',
  'معلومات المتجر:',
  s.about || '',
  s.delivery_fee ? 'سعر التوصيل: ' + s.delivery_fee + ' ' + cur : '',
  '',
  'الأسئلة الشائعة:',
  s.faq || '',
  '',
  'المنتجات (الاسم — السعر — الخيارات):',
  list || '- لا توجد منتجات بعد',
  '',
  'القواعد:',
  '- رد قصير: سطرين أو ثلاثة، وسؤال واحد على الأكثر.',
  '- لا تخترع أي معلومة أو رقم أو سعر أو موعد غير مكتوب فوق. إذا لا تعرف فاستعمل intent "human".',
  '- لا تحسب المجموع ولا تكتب ملخص الطلب: النظام يحسبه ويكتبه.',
  '- إذا أراد الشراء: اجمع المنتج والخيار والكمية والاسم والهاتف والعنوان، واحد في كل مرة. حين تكتمل كلها استعمل intent "order".',
  '- إذا وافق على ملخص الطلب المعروض عليه: intent "confirm". لا تقل أبداً إن الطلب تأكد أو تسجّل.',
  '- إذا طلب التكلم مع إنسان، أو اشتكى، أو سأل عن شيء غير موجود في المعلومات: intent "human".',
  '- إذا وصلك «[فويس غير مسموع]»: اطلب منه يكتب رسالته.',
  chat.summary_shown && chat.pending_order ? '- عرضت عليه ملخص طلب في ردك الأخير وتنتظر جوابه.' : '',
  '',
  'أجب بـ JSON فقط، بهذا الشكل:',
  '{"intent":"chat|order|confirm|human","reply":"نص الرد","order":{"items":[{"product":"الاسم كما في القائمة","option":"","qty":1}],"name":"","phone":"","address":""}}',
].join('\n');

const messages = [{ role: 'system', content: system }].concat(history.map((r) => ({
  role: r.role === 'customer' ? 'user' : 'assistant',
  content: (r.role === 'owner' ? '(صاحب المتجر) ' : '') + r.text,
})));

return [{ json: { go: true, request: {
  model: s.ai_model || 'anthropic/claude-haiku-5.5',
  messages,
  response_format: { type: 'json_object' },
  max_tokens: 500,
  temperature: 0.3,
} } }];
