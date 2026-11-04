// Code node «Read settings»: the key/value rows of bot_settings -> one item = the message + settings.
const settings = {};
for (const r of $input.all()) settings[String(r.json.key ?? '').trim()] = String(r.json.value ?? '');
const m = $('New message').first().json;
return [{ json: { ...m, text: String(m.text ?? '').trim(), settings } }];
