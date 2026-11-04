// Code node «Is it our echo?»: a message from the shop's own number/Page is ours when one of the bot's last
// saved messages in this chat contains it (a long reply arrives back in pieces). Otherwise the owner typed it.
const m = $('Read settings').first().json;
const t = String(m.text || '').trim();
const echo = !!t && $input.all().some((i) => i.json.role === 'bot' && String(i.json.text || '').includes(t));
return [{ json: { ...m, echo } }];
