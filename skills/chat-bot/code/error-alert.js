// Code node «Write the alert»: a failed run of any bot workflow -> one WhatsApp line to the owner.
const e = $('A bot workflow failed').first().json;
const s = {};
for (const r of $input.all()) s[String(r.json.key ?? '').trim()] = String(r.json.value ?? '');
const to = String(s.owner_phone || '').replace(/\D/g, '');
if (!to) return [];
const where = e.execution?.lastNodeExecuted ? ' عند «' + e.execution.lastNodeExecuted + '»' : '';
const text = '⚠️ عطل في «' + (e.workflow?.name || 'البوت') + '»' + where + ': '
  + String(e.execution?.error?.message || 'خطأ غير معروف').slice(0, 300)
  + (e.execution?.url ? '\n' + e.execution.url : '');
return [{ json: { to, text } }];
