// Code node «Who gets a follow-up?»: chats whose follow_at has passed -> at most 2 nudges, never in quiet
// hours, never after an opt-out or while a human has the chat. Instagram and Messenger refuse any message
// 24 h after the customer's last one, so those chats are closed (follow_at cleared) instead of nudged.
const s = {};
for (const r of $('Settings').all()) s[String(r.json.key ?? '').trim()] = String(r.json.value ?? '');
if (String(s.bot_enabled ?? '').trim() !== 'true') return [];

let hour;
try { hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: s.timezone || 'UTC' }).format(new Date())); }
catch (e) { hour = new Date().getUTCHours(); }
if (hour >= 22 || hour < 9) return []; // quiet hours in the shop's time zone: the next run after 09:00 sends

const now = Date.now();
const out = [];
for (const i of $input.all()) {
  const c = i.json;
  if (!c.chat_id || !c.follow_at || c.opted_out === true) continue;
  if (new Date(c.follow_at).getTime() > now) continue;
  if (c.human_until && new Date(c.human_until).getTime() > now) continue;
  const round = Number(c.follow_round || 0);
  if (round >= 2) continue;
  const meta = /^(fb|ig):/.test(c.chat_id);
  const last = c.last_customer_at ? new Date(c.last_customer_at).getTime() : 0;
  const closed = meta && now - last > 23 * 3600e3;
  const text = closed ? '' : String((round === 0 ? s.followup_1 : s.followup_2) || '').trim();
  out.push({ json: {
    chat_id: c.chat_id,
    channel: c.channel || (meta ? c.chat_id.slice(0, 2) : 'wa'),
    text,
    next_round: round + 1,
    // Meta's window closes 24 h after the customer's last message: its second nudge comes sooner
    next_at: round === 0 && text ? new Date(now + (meta ? 18 : 20) * 3600e3).toISOString() : null,
  } });
}
return out;
