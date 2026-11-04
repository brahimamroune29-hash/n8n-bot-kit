import { workflow, node, trigger, switchCase, newCredential, expr } from '@n8n/workflow-sdk';

const sendRequest = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Message to send',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: { values: [
        { name: 'channel', type: 'string' },
        { name: 'to', type: 'string' },
        { name: 'text', type: 'string' }
      ] }
    }
  },
  output: [{ channel: 'wa', to: '999000000001', text: 'مرحبا' }]
});

const fitMessage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fit to the channel', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: '@@code/fit-message.js' } },
  output: [{ channel: 'wa', to: '999000000001', text: 'مرحبا' }]
});

const byChannel = switchCase({
  version: 3.4,
  config: {
    name: 'Which channel?',
    parameters: {
      rules: { values: [
        { outputKey: 'whatsapp', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'wa' }], combinator: 'and' } },
        { outputKey: 'facebook', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.channel }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^(fb|ig)$' }], combinator: 'and' } }
      ] },
      options: {}
    }
  },
  output: [{ channel: 'wa', to: '999000000001', text: 'مرحبا' }]
});

const sendWhatsapp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Send on WhatsApp',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'POST',
      url: 'https://www.wasenderapi.com/api/send-message',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ to: $json.to.includes("@") ? $json.to : "+" + $json.to.replace(/\\D/g, ""), text: $json.text }) }}'),
      options: { timeout: 20000 }
    },
    credentials: { httpBearerAuth: newCredential('Wasender API') }
  },
  output: [{ success: true }]
});

const sendFacebook = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Send on Instagram or Messenger',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      method: 'POST',
      url: 'https://graph.facebook.com/v26.0/me/messages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ recipient: { id: $json.to.replace(/^(fb|ig):/, "") }, messaging_type: "RESPONSE", message: { text: $json.text } }) }}'),
      options: { timeout: 20000 }
    },
    credentials: { httpBearerAuth: newCredential('Facebook Page token') }
  },
  output: [{ recipient_id: '1', message_id: 'm1' }]
});

export default workflow('bot-send', 'bot · send')
  .add(sendRequest)
  .to(fitMessage)
  .to(byChannel
    .onCase(0, sendWhatsapp)
    .onCase(1, sendFacebook));
