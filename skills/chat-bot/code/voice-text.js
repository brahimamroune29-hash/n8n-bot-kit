// Code node «Voice as text»: the transcript becomes the message text; a failed download or transcription
// becomes a marker the AI answers by asking the customer to write.
const m = $('Read settings').first().json;
const t = String($input.first().json.text ?? '').trim();
return [{ json: { ...m, text: t ? '🎤 ' + t : '[فويس غير مسموع]', guard: t ? '' : 'voice-failed' } }];
