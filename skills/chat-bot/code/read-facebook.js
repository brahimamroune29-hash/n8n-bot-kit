// Code node «Read Instagram or Messenger message»: Meta webhook (object page | instagram) -> one item per message.
// Chat ids are «fb:<PSID>» or «ig:<IGSID>». An echo (our send, or the owner typing in the Page inbox) has from_me.
const out = [];
const now = Date.now();
const cdn = (u) => {
  try {
    const host = new URL(u).hostname;
    return u.startsWith('https://') && /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com|facebook\.com|instagram\.com)$/.test(host) ? u : '';
  } catch (e) { return ''; }
};

for (const item of $input.all()) {
  const body = item.json.body ?? {};
  const pre = body.object === 'page' ? 'fb' : body.object === 'instagram' ? 'ig' : null;
  if (!pre) continue;
  for (const entry of (Array.isArray(body.entry) ? body.entry : []).slice(0, 20)) {
    for (const ev of (Array.isArray(entry?.messaging) ? entry.messaging : []).slice(0, 20)) {
      const m = ev?.message;
      if (!m?.mid || m.is_deleted || m.is_unsupported) continue; // reactions, reads, postbacks
      const fromMe = m.is_echo === true;
      const who = String((fromMe ? ev.recipient?.id : ev.sender?.id) ?? '');
      const at = Number(ev.timestamp) || now;
      if (!/^\d+$/.test(who) || now - at > 24 * 3600e3) continue; // past 24 h Meta refuses any reply
      const row = { channel: pre, chat_id: pre + ':' + who, msg_id: String(m.mid), from_me: fromMe, name: '', media: {}, media_url: '' };
      const text = String(m.text ?? '').trim().slice(0, 1500);
      const a = Array.isArray(m.attachments) ? m.attachments[0] : null;
      if (a?.type === 'audio' && cdn(a.payload?.url)) out.push({ json: { ...row, kind: 'voice', text: '', media_url: cdn(a.payload.url) } });
      else if (a?.type === 'image' || a?.type === 'share') out.push({ json: { ...row, kind: 'image', text: text ? '📷 [صورة] ' + text : '📷 [صورة بلا تعليق]' } });
      else if (text) out.push({ json: { ...row, kind: 'text', text } });
    }
  }
}
return out;
