import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const failed = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: { name: 'A bot workflow failed', parameters: {} },
  output: [{ execution: { id: '1', url: 'https://n8n.example/execution/1', lastNodeExecuted: 'Send on WhatsApp', error: { message: '422' } }, workflow: { id: 'x', name: 'bot · send' } }]
});

const ownerPhone = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Owner phone',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_settings' },
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: 'owner_phone' }] },
      limit: 1
    }
  },
  output: [{ key: 'owner_phone', value: '999000000009' }]
});

const writeAlert = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Write the alert', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/error-alert.js' } },
  output: [{ to: '999000000009', text: '⚠️ عطل في «bot · send»' }]
});

const saveAlert = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save alert',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'name', value: 'bot_messages' },
      columns: { mappingMode: 'defineBelow', value: {
        chat_id: expr('{{ $json.to }}'),
        msg_id: expr('error-{{ $execution.id }}'),
        role: 'bot',
        text: expr('{{ $json.text }}'),
        guard: 'alert'
      } }
    }
  },
  output: [{ id: 1, chat_id: '999000000009', text: '⚠️ عطل' }]
});

const sendAlert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Tell the owner on WhatsApp',
    parameters: {
      method: 'POST',
      url: 'https://www.wasenderapi.com/api/send-message',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ to: '+' + $('Write the alert').item.json.to, text: $('Write the alert').item.json.text }) }}"),
      options: { timeout: 20000 }
    },
    credentials: { httpBearerAuth: newCredential('Wasender API') }
  },
  output: [{ success: true }]
});

export default workflow('bot-errors', 'bot · errors')
  .add(failed)
  .to(ownerPhone)
  .to(writeAlert)
  .to(saveAlert)
  .to(sendAlert);
