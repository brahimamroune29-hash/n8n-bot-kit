import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const whatsappWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'WhatsApp webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'whatsapp-bot',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: { onlyRunIf: expr("{{ String($json.body?.event ?? '').toLowerCase() === 'messages.upsert' }}") }
    },
    credentials: { httpHeaderAuth: newCredential('Wasender webhook secret') }
  },
  output: [{ body: { event: 'messages.upsert', data: { messages: { key: { id: 'ABC', remoteJid: '999000000001@s.whatsapp.net', fromMe: false }, message: { conversation: 'سلام' }, pushName: 'أمين' } } } }]
});

const readMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read WhatsApp message', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/read-whatsapp.js' } },
  output: [{ channel: 'wa', chat_id: '999000000001', msg_id: 'ABC', from_me: false, kind: 'text', text: 'سلام', name: 'أمين', media: {}, media_url: '' }]
});

const toBrain = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Hand to the brain',
    parameters: {
      mode: 'each',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'BRAIN_WORKFLOW_ID' },
      workflowInputs: { mappingMode: 'defineBelow', value: {
        channel: expr('{{ $json.channel }}'),
        chat_id: expr('{{ $json.chat_id }}'),
        msg_id: expr('{{ $json.msg_id }}'),
        from_me: expr('{{ $json.from_me }}'),
        kind: expr('{{ $json.kind }}'),
        text: expr('{{ $json.text }}'),
        name: expr('{{ $json.name }}'),
        media: expr('{{ $json.media }}'),
        media_url: expr('{{ $json.media_url }}')
      }, matchingColumns: [], schema: [
        { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'chat_id', displayName: 'chat_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'msg_id', displayName: 'msg_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'from_me', displayName: 'from_me', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'boolean' },
        { id: 'kind', displayName: 'kind', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'text', displayName: 'text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'name', displayName: 'name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
        { id: 'media', displayName: 'media', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object' },
        { id: 'media_url', displayName: 'media_url', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
      ], attemptToConvertTypes: false, convertFieldsToString: false },
      options: { waitForSubWorkflow: false }
    }
  },
  output: [{}]
});

export default workflow('bot-whatsapp', 'bot · whatsapp')
  .add(whatsappWebhook)
  .to(readMessage)
  .to(toBrain);
