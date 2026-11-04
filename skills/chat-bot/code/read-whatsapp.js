// Code node «Read WhatsApp message»: Wasender messages.upsert -> one item per private-chat message.
const out = [];
const now = Date.now();
const digitsOf = (s) => String(s ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
const isPhone = (s) => /@(s\.whatsapp\.net|c\.us)$/.test(String(s ?? ''));
const msOf = (v) => {
  const n = Number(v && typeof v === 'object' ? v.low : v);
  return Number.isFinite(n) && n > 0 ? (n > 1e12 ? n : n * 1000) : 0;
};

for (const item of $input.all()) {
  const body = item.json.body ?? {};
  const data = body.data ?? {};
  const raw = data.messages ?? (data.key ? data : null);
  for (const d of (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 20)) {
    const key = d?.key ?? {};
    const id = String(key.id ?? ''), jid = String(key.remoteJid ?? '');
    if (!id || !jid || /@g\.us|broadcast|@newsletter/.test(jid)) continue; // groups, status, channels
    const at = msOf(d.messageTimestamp) || msOf(body.timestamp) || now;
    if (now - at > 10 * 60e3) continue; // WhatsApp replays old messages after a reconnect
    const fromMe = key.fromMe === true;
    // fromMe: remoteJid is the customer; otherwise the sender fields are
    let phone = fromMe
      ? (isPhone(jid) ? digitsOf(jid) : '') || (isPhone(key.remoteJidAlt) ? digitsOf(key.remoteJidAlt) : '')
      : digitsOf(key.cleanedSenderPn) || (isPhone(key.senderPn) ? digitsOf(key.senderPn) : '')
        || (isPhone(key.remoteJidAlt) ? digitsOf(key.remoteJidAlt) : '') || (isPhone(jid) ? digitsOf(jid) : '');
    if (!phone && jid.endsWith('@lid') && digitsOf(jid)) phone = digitsOf(jid) + '@lid';
    if (!phone) continue;

    let msg = d.message ?? {};
    for (let i = 0; i < 3; i++) {
      const inner = msg.ephemeralMessage?.message ?? msg.viewOnceMessage?.message ?? msg.viewOnceMessageV2?.message ?? msg.documentWithCaptionMessage?.message;
      if (!inner) break;
      msg = inner;
    }
    const text = String(
      (typeof d.messageBody === 'string' && d.messageBody.trim()) ? d.messageBody
        : msg.conversation ?? msg.extendedTextMessage?.text ?? msg.imageMessage?.caption ?? msg.videoMessage?.caption ?? '',
    ).trim().slice(0, 1500);
    const row = { channel: 'wa', chat_id: phone, msg_id: id, from_me: fromMe, name: fromMe ? '' : String(d.pushName ?? '').slice(0, 64), media: {}, media_url: '' };
    if (msg.audioMessage) out.push({ json: { ...row, kind: 'voice', text: '', media: { key: { id }, message: { audioMessage: msg.audioMessage } } } });
    else if (msg.imageMessage) out.push({ json: { ...row, kind: 'image', text: text ? '📷 [صورة] ' + text : '📷 [صورة بلا تعليق]' } });
    else if (text) out.push({ json: { ...row, kind: 'text', text } });
    // stickers, reactions, videos without text: nothing to answer
  }
}
return out;
