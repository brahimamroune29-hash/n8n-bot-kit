// Code node «Fit to the channel»: Instagram and Messenger take at most 1000 characters per message, so a long
// reply goes out as several messages, cut at line breaks. WhatsApp gets one message.
const out = [];
for (const i of $input.all()) {
  const m = i.json;
  const max = /^(fb|ig)$/.test(m.channel) ? 1000 : 4000;
  let cur = '';
  const push = (t) => { if (t) out.push({ json: { ...m, text: t } }); };
  for (let line of String(m.text ?? '').split('\n')) {
    while (line.length > max) { push(cur); cur = ''; push(line.slice(0, max)); line = line.slice(max); }
    if (cur && cur.length + 1 + line.length > max) { push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  push(cur.trim() ? cur : '');
}
return out;
